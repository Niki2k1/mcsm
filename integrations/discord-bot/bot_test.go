package main

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/bwmarrin/discordgo"

	"github.com/Niki2k1/mcsm/integrations/discord-bot/internal/mcsm"
)

func env(values map[string]string) func(string) string {
	return func(key string) string { return values[key] }
}

func TestLoadConfigRequiresCoreSettings(t *testing.T) {
	_, err := LoadConfig(env(nil))
	if err == nil {
		t.Fatal("expected an error")
	}
	for _, name := range []string{"DISCORD_TOKEN", "MCSM_API_TOKEN", "MCSM_URL", "RULES_FILE"} {
		if !strings.Contains(err.Error(), name) {
			t.Errorf("error %q does not mention %s", err, name)
		}
	}
}

func TestLoadConfigValidatesRoleID(t *testing.T) {
	base := map[string]string{
		"DISCORD_TOKEN":  "x",
		"MCSM_URL":       "https://mcsm.example.com",
		"MCSM_API_TOKEN": "mcsm_pat_x",
		"RULES_FILE":     "rules.md",
	}
	if _, err := LoadConfig(env(base)); err != nil {
		t.Fatalf("valid config rejected: %v", err)
	}
	base["WHITELISTED_ROLE_ID"] = "not-a-role"
	if _, err := LoadConfig(env(base)); err == nil {
		t.Error("expected an error for a malformed role id")
	}
	base["WHITELISTED_ROLE_ID"] = " 123456789012345678 "
	cfg, err := LoadConfig(env(base))
	if err != nil || cfg.WhitelistedRoleID != "123456789012345678" {
		t.Errorf("cfg = %+v, err = %v", cfg, err)
	}
}

func TestParseRules(t *testing.T) {
	rules, err := ParseRules("# House rules\r\n\r\n1. Be nice\n2. No griefing\n")
	if err != nil {
		t.Fatal(err)
	}
	if rules.Title != "House rules" || rules.Body != "1. Be nice\n2. No griefing" {
		t.Errorf("rules = %+v", rules)
	}

	rules, err = ParseRules("Be nice.")
	if err != nil || rules.Title != "Server rules" || rules.Body != "Be nice." {
		t.Errorf("rules = %+v, err = %v", rules, err)
	}

	if _, err := ParseRules("# Only a title\n"); err == nil {
		t.Error("expected an error for empty rules")
	}
	if _, err := ParseRules(strings.Repeat("a", maxEmbedDescription+1)); err == nil {
		t.Error("expected an error for rules over Discord's limit")
	}
}

func TestLoadRulesReadsFile(t *testing.T) {
	path := filepath.Join(t.TempDir(), "rules.md")
	if err := os.WriteFile(path, []byte("# Rules\nBe nice."), 0o600); err != nil {
		t.Fatal(err)
	}
	rules, err := LoadRules(path)
	if err != nil || rules.Body != "Be nice." {
		t.Errorf("rules = %+v, err = %v", rules, err)
	}
	if _, err := LoadRules(filepath.Join(t.TempDir(), "missing.md")); err == nil {
		t.Error("expected an error for a missing file")
	}
}

func TestClaimNamePattern(t *testing.T) {
	for _, name := range []string{"Notch", "jeb_", "abc", "A_234567890123456"[:16]} {
		if !claimNamePattern.MatchString(name) {
			t.Errorf("%q rejected", name)
		}
	}
	for _, name := range []string{"", "ab", "a b", "Bob;op Eve", strings.Repeat("a", 17), "Bób"} {
		if claimNamePattern.MatchString(name) {
			t.Errorf("%q accepted", name)
		}
	}
}

func TestCustomIDsFitDiscordLimit(t *testing.T) {
	if len(claimModalPrefix) <= len(claimButtonPrefix) {
		t.Fatal("the modal prefix is expected to be the longer one")
	}
	if len(claimModalPrefix) >= maxCustomIDLength {
		t.Fatal("no room left for a server id")
	}
}

func TestTextInputValue(t *testing.T) {
	components := []discordgo.MessageComponent{
		&discordgo.ActionsRow{Components: []discordgo.MessageComponent{
			&discordgo.TextInput{CustomID: "other", Value: "x"},
			&discordgo.TextInput{CustomID: playerInputID, Value: "Notch"},
		}},
	}
	if got := textInputValue(components, playerInputID); got != "Notch" {
		t.Errorf("got %q", got)
	}
	if got := textInputValue(nil, playerInputID); got != "" {
		t.Errorf("got %q", got)
	}
}

func TestIsModerator(t *testing.T) {
	cases := map[string]struct {
		member *discordgo.Member
		want   bool
	}{
		"no member":     {nil, false},
		"regular":       {&discordgo.Member{Permissions: discordgo.PermissionSendMessages}, false},
		"manage server": {&discordgo.Member{Permissions: discordgo.PermissionManageGuild}, true},
		"administrator": {&discordgo.Member{Permissions: discordgo.PermissionAdministrator}, true},
	}
	for name, tc := range cases {
		if got := isModerator(tc.member); got != tc.want {
			t.Errorf("%s: got %v", name, got)
		}
	}
}

func TestClaimKeyIsPerUser(t *testing.T) {
	if claimKeyFor("42") != "discord:42" || claimKeyFor("42") == claimKeyFor("43") {
		t.Error("claim keys must be stable and distinct per user")
	}
}

func TestDescribeClaimError(t *testing.T) {
	cases := map[string]struct {
		err  error
		want string
	}{
		"already claimed": {&mcsm.APIError{StatusCode: 409, Reason: mcsm.ReasonKeyAlreadyClaimed}, "already whitelisted an account"},
		"name taken":      {&mcsm.APIError{StatusCode: 409, Reason: mcsm.ReasonPlayerAlreadyClaimed}, "claimed by another member"},
		"unknown player":  {&mcsm.APIError{StatusCode: 404, Reason: mcsm.ReasonPlayerNotFound}, "no Minecraft account"},
		"rcon down":       {&mcsm.APIError{StatusCode: http.StatusBadGateway}, "isn't accepting commands"},
		"bad token":       {&mcsm.APIError{StatusCode: http.StatusUnauthorized}, "invalid, expired or revoked"},
		"timeout":         {context.DeadlineExceeded, "did not answer in time"},
		"network":         {errors.New("dial tcp: connection refused"), "Could not reach"},
	}
	for name, tc := range cases {
		if got := describeClaimError(tc.err, "Notch"); !strings.Contains(got, tc.want) {
			t.Errorf("%s: %q does not contain %q", name, got, tc.want)
		}
	}
}

func TestFormatClaim(t *testing.T) {
	msg := formatClaim("SMP", "notch", mcsm.WhitelistChange{
		Result:     mcsm.ResultAdded,
		Player:     &mcsm.Player{Name: "Notch"},
		AppliedVia: "file",
	})
	if !strings.Contains(msg, "`Notch`") || !strings.Contains(msg, "offline") {
		t.Errorf("msg = %q", msg)
	}
}

func TestCodeNeutralisesMarkdown(t *testing.T) {
	if got := code("a_b`c"); got != "`a_b'c`" {
		t.Errorf("got %q", got)
	}
}

type fakeAPI struct {
	servers []mcsm.Server
	calls   int
}

func (f *fakeAPI) Servers(context.Context) ([]mcsm.Server, error) {
	f.calls++
	return f.servers, nil
}
func (f *fakeAPI) Server(context.Context, string) (mcsm.ServerStatus, error) {
	return mcsm.ServerStatus{}, nil
}
func (f *fakeAPI) Whitelist(context.Context, string) ([]mcsm.Player, error) { return nil, nil }
func (f *fakeAPI) AddToWhitelist(context.Context, string, string, string) (mcsm.WhitelistChange, error) {
	return mcsm.WhitelistChange{}, nil
}

func newTestBot(cfg Config, api *fakeAPI) *Bot {
	return &Bot{cfg: cfg, api: api, log: slog.New(slog.NewTextHandler(io.Discard, nil))}
}

func TestResolveServer(t *testing.T) {
	ctx := context.Background()
	one := &fakeAPI{servers: []mcsm.Server{{ID: "mc-smp", Name: "SMP"}}}

	if got, _ := newTestBot(Config{DefaultServer: "mc-default"}, one).resolveServer(ctx, "mc-explicit"); got != "mc-explicit" {
		t.Errorf("explicit option ignored: %q", got)
	}
	if got, _ := newTestBot(Config{DefaultServer: "mc-default"}, one).resolveServer(ctx, ""); got != "mc-default" {
		t.Errorf("default ignored: %q", got)
	}
	if got, _ := newTestBot(Config{}, one).resolveServer(ctx, ""); got != "mc-smp" {
		t.Errorf("single server not picked: %q", got)
	}

	two := &fakeAPI{servers: []mcsm.Server{{ID: "a"}, {ID: "b"}}}
	if _, err := newTestBot(Config{}, two).resolveServer(ctx, ""); !errors.Is(err, errNoServer) {
		t.Errorf("err = %v, want errNoServer", err)
	}
}

func TestServerListIsCached(t *testing.T) {
	api := &fakeAPI{servers: []mcsm.Server{{ID: "mc-smp", Name: "SMP"}}}
	bot := newTestBot(Config{}, api)
	if bot.serverName(context.Background(), "mc-smp") != "SMP" {
		t.Error("server name not resolved")
	}
	bot.serverName(context.Background(), "mc-smp")
	if api.calls != 1 {
		t.Errorf("servers fetched %d times", api.calls)
	}
}

func TestServerChoices(t *testing.T) {
	servers := []mcsm.Server{{ID: "mc-smp", Name: "Survival"}, {ID: "mc-cre", Name: "Creative"}}
	if got := serverChoices(servers, "surv"); len(got) != 1 || got[0].Value != "mc-smp" {
		t.Errorf("got %+v", got)
	}
	if got := serverChoices(servers, ""); len(got) != 2 {
		t.Errorf("got %d choices", len(got))
	}
}
