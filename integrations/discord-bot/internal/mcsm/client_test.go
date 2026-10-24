package mcsm

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

const testToken = "mcsm_pat_test"

func newTestClient(t *testing.T, handler http.HandlerFunc) *Client {
	t.Helper()
	srv := httptest.NewServer(handler)
	t.Cleanup(srv.Close)
	c, err := New(srv.URL+"/", testToken, srv.Client())
	if err != nil {
		t.Fatal(err)
	}
	return c
}

func TestNewValidatesConfig(t *testing.T) {
	if _, err := New("mcsm.example.com", testToken, nil); err == nil {
		t.Error("expected an error for a URL without scheme")
	}
	if _, err := New("https://mcsm.example.com", "", nil); err == nil {
		t.Error("expected an error for a missing token")
	}
}

func TestWhitelistSendsBearerToken(t *testing.T) {
	c := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		if got := r.Header.Get("Authorization"); got != "Bearer "+testToken {
			t.Errorf("Authorization = %q", got)
		}
		if r.Method != http.MethodGet || r.URL.Path != "/api/v1/servers/mc-smp/whitelist" {
			t.Errorf("unexpected request %s %s", r.Method, r.URL.Path)
		}
		w.Write([]byte(`{"players":[{"name":"Alice","uuid":"1"}]}`))
	})

	players, err := c.Whitelist(context.Background(), "mc-smp")
	if err != nil {
		t.Fatal(err)
	}
	if len(players) != 1 || players[0].Name != "Alice" {
		t.Errorf("players = %+v", players)
	}
}

func TestAddToWhitelistPostsName(t *testing.T) {
	c := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost || r.URL.Path != "/api/v1/servers/mc-smp/whitelist" {
			t.Errorf("unexpected request %s %s", r.Method, r.URL.Path)
		}
		var body map[string]string
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body["name"] != "Bob" {
			t.Errorf("body = %v (%v)", body, err)
		}
		if _, ok := body["claimKey"]; ok {
			t.Errorf("unexpected claimKey in %v", body)
		}
		w.Write([]byte(`{"result":"added","player":{"name":"Bob","uuid":"2"},"appliedVia":"rcon"}`))
	})

	change, err := c.AddToWhitelist(context.Background(), "mc-smp", "Bob", "")
	if err != nil {
		t.Fatal(err)
	}
	if change.Result != ResultAdded || change.Player == nil || change.AppliedVia != "rcon" {
		t.Errorf("change = %+v", change)
	}
}

func TestAddToWhitelistSendsClaimKey(t *testing.T) {
	c := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		var body map[string]string
		json.NewDecoder(r.Body).Decode(&body)
		if body["claimKey"] != "discord:42" {
			t.Errorf("body = %v", body)
		}
		w.Write([]byte(`{"result":"added","player":{"name":"Bob","uuid":"2"},"appliedVia":"rcon","claim":{"claimKey":"discord:42","createdAt":1}}`))
	})

	change, err := c.AddToWhitelist(context.Background(), "mc-smp", "Bob", "discord:42")
	if err != nil {
		t.Fatal(err)
	}
	if change.Claim == nil || change.Claim.ClaimKey != "discord:42" {
		t.Errorf("change = %+v", change)
	}
}

func TestClaimConflictCarriesReason(t *testing.T) {
	c := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusConflict)
		w.Write([]byte(`{"statusCode":409,"statusMessage":"This claim key already whitelisted Bob","data":{"reason":"key-already-claimed","player":"Bob"}}`))
	})

	_, err := c.AddToWhitelist(context.Background(), "mc-smp", "Alice", "discord:42")
	if !IsStatus(err, http.StatusConflict) || !HasReason(err, ReasonKeyAlreadyClaimed) {
		t.Errorf("err = %#v", err)
	}
}

func TestRemoveFromWhitelistUsesDelete(t *testing.T) {
	c := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodDelete || r.URL.Path != "/api/v1/servers/mc-smp/whitelist/Bob" {
			t.Errorf("unexpected request %s %s", r.Method, r.URL.Path)
		}
		w.Write([]byte(`{"result":"not-whitelisted","appliedVia":"file"}`))
	})

	change, err := c.RemoveFromWhitelist(context.Background(), "mc-smp", "Bob")
	if err != nil {
		t.Fatal(err)
	}
	if change.Result != ResultNotWhitelisted {
		t.Errorf("change = %+v", change)
	}
}

func TestRejectsInvalidNamesWithoutRequest(t *testing.T) {
	c := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		t.Errorf("unexpected request %s %s", r.Method, r.URL.Path)
	})

	for _, name := range []string{"", "a b", "Bob; op Eve", strings.Repeat("a", 17)} {
		if _, err := c.AddToWhitelist(context.Background(), "mc-smp", name, ""); err == nil {
			t.Errorf("AddToWhitelist(%q) succeeded", name)
		}
		if _, err := c.RemoveFromWhitelist(context.Background(), "mc-smp", name); err == nil {
			t.Errorf("RemoveFromWhitelist(%q) succeeded", name)
		}
	}
}

func TestEscapesServerID(t *testing.T) {
	c := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		if r.URL.EscapedPath() != "/api/v1/servers/a%2Fb" {
			t.Errorf("path = %s", r.URL.EscapedPath())
		}
		w.Write([]byte(`{}`))
	})
	if _, err := c.Server(context.Background(), "a/b"); err != nil {
		t.Fatal(err)
	}
}

func TestAPIErrorCarriesStatusMessage(t *testing.T) {
	c := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNotFound)
		w.Write([]byte(`{"error":true,"statusCode":404,"statusMessage":"Server not found","message":"Server not found"}`))
	})

	_, err := c.Server(context.Background(), "nope")
	if !IsStatus(err, http.StatusNotFound) {
		t.Fatalf("err = %v, want 404", err)
	}
	if !strings.Contains(err.Error(), "Server not found") {
		t.Errorf("err = %v", err)
	}
}

func TestAPIErrorFallsBackToHTTPStatus(t *testing.T) {
	c := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusBadGateway)
		w.Write([]byte(`<html>bad gateway</html>`))
	})

	_, err := c.Servers(context.Background())
	if !IsStatus(err, http.StatusBadGateway) || !strings.Contains(err.Error(), "502") {
		t.Errorf("err = %v", err)
	}
}

func TestKeepsBasePath(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/mcsm/api/v1/token" {
			t.Errorf("path = %s", r.URL.Path)
		}
		w.Write([]byte(`{"kind":"personal","user":"Admin","scopes":["players:whitelist"],"servers":["mc-smp"]}`))
	}))
	defer srv.Close()

	c, err := New(srv.URL+"/mcsm", testToken, srv.Client())
	if err != nil {
		t.Fatal(err)
	}
	info, err := c.Token(context.Background())
	if err != nil || !info.Has(ScopeWhitelist) || len(info.Servers) != 1 {
		t.Errorf("info = %+v, err = %v", info, err)
	}
}

func TestTokenInfoHas(t *testing.T) {
	operate := TokenInfo{Scopes: []string{ScopeOperate}}
	if !operate.Has(ScopeWhitelist) {
		t.Error("Operate should cover Whitelist")
	}
	whitelist := TokenInfo{Scopes: []string{ScopeWhitelist}}
	if whitelist.Has(ScopeOperate) || whitelist.Has(ScopeRead) {
		t.Error("Whitelist must not imply other scopes")
	}
}
