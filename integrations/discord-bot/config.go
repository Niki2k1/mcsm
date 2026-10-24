package main

import (
	"errors"
	"fmt"
	"slices"
	"strings"
)

// Config is read from environment variables, so the bot fits a container
// without a config file.
type Config struct {
	DiscordToken string
	// GuildID registers commands for one guild only, where they show up
	// immediately; global commands can take a while to propagate.
	GuildID       string
	MCSMURL       string
	MCSMToken     string
	DefaultServer string
	// RulesFile is the Markdown file posted by /setup-rules. It is read on
	// every post, so edits apply without a restart.
	RulesFile string
	// WhitelistedRoleID is given to members after a successful claim.
	WhitelistedRoleID string
}

// LoadConfig reads the configuration through getenv (os.Getenv in main).
func LoadConfig(getenv func(string) string) (Config, error) {
	cfg := Config{
		DiscordToken:      strings.TrimSpace(getenv("DISCORD_TOKEN")),
		GuildID:           strings.TrimSpace(getenv("DISCORD_GUILD_ID")),
		MCSMURL:           strings.TrimSpace(getenv("MCSM_URL")),
		MCSMToken:         strings.TrimSpace(getenv("MCSM_API_TOKEN")),
		DefaultServer:     strings.TrimSpace(getenv("MCSM_SERVER_ID")),
		RulesFile:         strings.TrimSpace(getenv("RULES_FILE")),
		WhitelistedRoleID: strings.TrimSpace(getenv("WHITELISTED_ROLE_ID")),
	}

	var missing []string
	for name, value := range map[string]string{
		"DISCORD_TOKEN":  cfg.DiscordToken,
		"MCSM_URL":       cfg.MCSMURL,
		"MCSM_API_TOKEN": cfg.MCSMToken,
		"RULES_FILE":     cfg.RulesFile,
	} {
		if value == "" {
			missing = append(missing, name)
		}
	}
	if len(missing) > 0 {
		// Sorted so the message is stable despite random map iteration order.
		slices.Sort(missing)
		return cfg, fmt.Errorf("missing required environment variables: %s", strings.Join(missing, ", "))
	}
	if cfg.WhitelistedRoleID != "" && !isSnowflake(cfg.WhitelistedRoleID) {
		return cfg, errors.New("WHITELISTED_ROLE_ID must be a Discord role ID")
	}
	if cfg.GuildID != "" && !isSnowflake(cfg.GuildID) {
		return cfg, errors.New("DISCORD_GUILD_ID must be a Discord server ID")
	}
	return cfg, nil
}

func isSnowflake(id string) bool {
	if id == "" || len(id) > 20 {
		return false
	}
	for _, r := range id {
		if r < '0' || r > '9' {
			return false
		}
	}
	return true
}
