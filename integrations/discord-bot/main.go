// Command discord-bot manages a Minecraft server's whitelist from Discord
// through the mcsm public API.
package main

import (
	"context"
	"log/slog"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/bwmarrin/discordgo"

	"github.com/Niki2k1/mcsm/integrations/discord-bot/internal/mcsm"
)

func main() {
	log := slog.New(slog.NewTextHandler(os.Stderr, nil))
	if err := run(log); err != nil {
		log.Error("bot stopped", "err", err)
		os.Exit(1)
	}
}

func run(log *slog.Logger) error {
	cfg, err := LoadConfig(os.Getenv)
	if err != nil {
		return err
	}

	client, err := mcsm.New(cfg.MCSMURL, cfg.MCSMToken, nil)
	if err != nil {
		return err
	}

	// Fail fast on a wrong URL or token instead of on the first command.
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	info, err := client.Token(ctx)
	cancel()
	if err != nil {
		return err
	}
	log.Info("connected to mcsm", "user", info.User, "scopes", info.Scopes, "servers", info.Servers)
	if !info.Has(mcsm.ScopeWhitelist) {
		log.Warn("token lacks the players:whitelist scope; the rules button will fail to whitelist anyone")
	}
	if !info.Has(mcsm.ScopeRead) {
		log.Warn("token lacks the servers:read scope; /whitelist list, /mcstatus and server autocomplete will fail")
	}
	// Only a warning: the file is read again on every /setup-rules, so it can
	// be fixed without restarting the bot.
	if _, err := LoadRules(cfg.RulesFile); err != nil {
		log.Warn("rules file is not usable yet", "file", cfg.RulesFile, "err", err)
	}

	session, err := discordgo.New("Bot " + cfg.DiscordToken)
	if err != nil {
		return err
	}
	// Slash commands need no privileged intents.
	session.Identify.Intents = discordgo.IntentsGuilds

	bot := &Bot{cfg: cfg, api: client, log: log}
	session.AddHandler(bot.HandleInteraction)
	session.AddHandler(func(s *discordgo.Session, r *discordgo.Ready) {
		log.Info("logged in to Discord", "user", r.User.Username)
	})

	if err := session.Open(); err != nil {
		return err
	}
	defer session.Close()

	// Overwriting (not creating) keeps the registered set in sync with this
	// binary, removing commands that older versions added.
	if _, err := session.ApplicationCommandBulkOverwrite(session.State.User.ID, cfg.GuildID, commands); err != nil {
		return err
	}

	stop, cancelStop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancelStop()
	<-stop.Done()
	log.Info("shutting down")
	return nil
}
