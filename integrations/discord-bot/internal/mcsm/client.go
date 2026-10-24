// Package mcsm is a small client for the mcsm public API (/api/v1).
package mcsm

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"
)

// PlayerNamePattern matches valid Minecraft usernames. mcsm enforces the same
// pattern; checking locally gives users instant feedback.
var PlayerNamePattern = regexp.MustCompile(`^[A-Za-z0-9_]{1,16}$`)

// Client talks to one mcsm instance with one API token.
type Client struct {
	baseURL *url.URL
	token   string
	http    *http.Client
}

// New returns a client for the mcsm instance at baseURL (e.g.
// "https://mcsm.example.com"). A nil httpClient gets a default with a timeout.
func New(baseURL, token string, httpClient *http.Client) (*Client, error) {
	u, err := url.Parse(strings.TrimRight(baseURL, "/"))
	if err != nil {
		return nil, fmt.Errorf("invalid mcsm URL: %w", err)
	}
	if u.Scheme != "http" && u.Scheme != "https" {
		return nil, fmt.Errorf("invalid mcsm URL %q: scheme must be http or https", baseURL)
	}
	if token == "" {
		return nil, errors.New("missing mcsm API token")
	}
	if httpClient == nil {
		// Whitelist changes may wait on a Mojang lookup and RCON, so allow
		// more than a typical API call but still give up eventually.
		httpClient = &http.Client{Timeout: 30 * time.Second}
	}
	return &Client{baseURL: u, token: token, http: httpClient}, nil
}

// APIError is a non-2xx answer from mcsm.
type APIError struct {
	StatusCode int
	Message    string
	// Reason is mcsm's machine-readable cause, when it gives one (see the
	// Reason* constants).
	Reason string
}

// Reasons mcsm reports for whitelist failures.
const (
	ReasonPlayerNotFound       = "player-not-found"
	ReasonKeyAlreadyClaimed    = "key-already-claimed"
	ReasonPlayerAlreadyClaimed = "player-already-claimed"
)

// HasReason reports whether err is an APIError with the given reason.
func HasReason(err error, reason string) bool {
	var apiErr *APIError
	return errors.As(err, &apiErr) && apiErr.Reason == reason
}

func (e *APIError) Error() string {
	return fmt.Sprintf("mcsm: %d %s", e.StatusCode, e.Message)
}

// IsStatus reports whether err is an APIError with the given status code.
func IsStatus(err error, status int) bool {
	var apiErr *APIError
	return errors.As(err, &apiErr) && apiErr.StatusCode == status
}

// TokenInfo describes the token in use.
type TokenInfo struct {
	// Kind is "personal" for personal access tokens or "oauth".
	Kind   string   `json:"kind"`
	User   string   `json:"user"`
	Scopes []string `json:"scopes"`
	// Servers lists the world volumes the token is limited to; nil means
	// every server the user can access.
	Servers []string `json:"servers"`
}

// Token scopes the bot cares about.
const (
	ScopeRead      = "servers:read"
	ScopeWhitelist = "players:whitelist"
	ScopeOperate   = "servers:operate"
)

// Has reports whether the token can use scope, counting the broader Operate
// scope as covering Whitelist like mcsm does.
func (t TokenInfo) Has(scope string) bool {
	for _, s := range t.Scopes {
		if s == scope || (scope == ScopeWhitelist && s == ScopeOperate) {
			return true
		}
	}
	return false
}

// Server is a server the token can access.
type Server struct {
	ID      string  `json:"id"`
	Name    string  `json:"name"`
	Domain  *string `json:"domain"`
	Running bool    `json:"running"`
}

// ServerStatus is a server plus its live state.
type ServerStatus struct {
	Server
	// Ready is false while the server is stopped or still starting.
	Ready   bool `json:"ready"`
	Players struct {
		Online []string `json:"online"`
		Count  int      `json:"count"`
	} `json:"players"`
}

// Player is a whitelist entry.
type Player struct {
	Name string `json:"name"`
	UUID string `json:"uuid"`
}

// Whitelist change results.
const (
	ResultAdded              = "added"
	ResultAlreadyWhitelisted = "already-whitelisted"
	ResultRemoved            = "removed"
	ResultNotWhitelisted     = "not-whitelisted"
)

// WhitelistChange is the outcome of adding or removing a player.
type WhitelistChange struct {
	Result string  `json:"result"`
	Player *Player `json:"player"`
	// Claim is set when the change was made with a claim key.
	Claim *struct {
		ClaimKey  string `json:"claimKey"`
		CreatedAt int64  `json:"createdAt"`
	} `json:"claim"`
	// AppliedVia is "rcon" for a running server and "file" for a stopped one,
	// where the change takes effect on the next start.
	AppliedVia string `json:"appliedVia"`
}

// Token returns information about the configured token.
func (c *Client) Token(ctx context.Context) (TokenInfo, error) {
	var out TokenInfo
	err := c.do(ctx, http.MethodGet, "/api/v1/token", nil, &out)
	return out, err
}

// Servers lists the servers the token can access.
func (c *Client) Servers(ctx context.Context) ([]Server, error) {
	var out []Server
	err := c.do(ctx, http.MethodGet, "/api/v1/servers", nil, &out)
	return out, err
}

// Server returns the live status of one server.
func (c *Client) Server(ctx context.Context, id string) (ServerStatus, error) {
	var out ServerStatus
	err := c.do(ctx, http.MethodGet, "/api/v1/servers/"+url.PathEscape(id), nil, &out)
	return out, err
}

// Whitelist returns the server's whitelist.
func (c *Client) Whitelist(ctx context.Context, id string) ([]Player, error) {
	var out struct {
		Players []Player `json:"players"`
	}
	err := c.do(ctx, http.MethodGet, "/api/v1/servers/"+url.PathEscape(id)+"/whitelist", nil, &out)
	return out.Players, err
}

// AddToWhitelist whitelists a player; adding an existing entry is not an
// error. A non-empty claimKey makes it a one-time claim: mcsm answers 409
// (ReasonKeyAlreadyClaimed / ReasonPlayerAlreadyClaimed) on repeats.
func (c *Client) AddToWhitelist(ctx context.Context, id, name, claimKey string) (WhitelistChange, error) {
	var out WhitelistChange
	if err := checkName(name); err != nil {
		return out, err
	}
	body := map[string]string{"name": name}
	if claimKey != "" {
		body["claimKey"] = claimKey
	}
	err := c.do(ctx, http.MethodPost, "/api/v1/servers/"+url.PathEscape(id)+"/whitelist", body, &out)
	return out, err
}

// RemoveFromWhitelist removes a player; removing a missing entry is not an error.
func (c *Client) RemoveFromWhitelist(ctx context.Context, id, name string) (WhitelistChange, error) {
	var out WhitelistChange
	if err := checkName(name); err != nil {
		return out, err
	}
	path := "/api/v1/servers/" + url.PathEscape(id) + "/whitelist/" + url.PathEscape(name)
	err := c.do(ctx, http.MethodDelete, path, nil, &out)
	return out, err
}

func checkName(name string) error {
	if !PlayerNamePattern.MatchString(name) {
		return fmt.Errorf("invalid Minecraft player name %q", name)
	}
	return nil
}

// Error bodies are small JSON objects; cap reads so a misbehaving proxy
// can't make the bot buffer an arbitrary page.
const maxBodyBytes = 1 << 20

func (c *Client) do(ctx context.Context, method, path string, body, out any) error {
	var reader io.Reader
	if body != nil {
		raw, err := json.Marshal(body)
		if err != nil {
			return err
		}
		reader = bytes.NewReader(raw)
	}

	// JoinPath keeps a base path, so mcsm can live under a sub-path.
	req, err := http.NewRequestWithContext(ctx, method, c.baseURL.JoinPath(path).String(), reader)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+c.token)
	req.Header.Set("Accept", "application/json")
	req.Header.Set("User-Agent", "mcsm-discord-bot")
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}

	resp, err := c.http.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	raw, err := io.ReadAll(io.LimitReader(resp.Body, maxBodyBytes))
	if err != nil {
		return err
	}

	if resp.StatusCode < 200 || resp.StatusCode > 299 {
		message, reason := parseError(raw, resp.Status)
		return &APIError{StatusCode: resp.StatusCode, Message: message, Reason: reason}
	}
	if out == nil {
		return nil
	}
	if err := json.Unmarshal(raw, out); err != nil {
		return fmt.Errorf("mcsm: unexpected response: %w", err)
	}
	return nil
}

// parseError extracts message and reason from mcsm's (h3) error body.
func parseError(raw []byte, fallback string) (message, reason string) {
	var body struct {
		StatusMessage string `json:"statusMessage"`
		Message       string `json:"message"`
		Data          struct {
			Reason string `json:"reason"`
		} `json:"data"`
	}
	if json.Unmarshal(raw, &body) != nil {
		return fallback, ""
	}
	switch {
	case body.StatusMessage != "":
		message = body.StatusMessage
	case body.Message != "":
		message = body.Message
	default:
		message = fallback
	}
	return message, body.Data.Reason
}
