package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/bwmarrin/discordgo"

	"github.com/Niki2k1/mcsm/integrations/discord-bot/internal/mcsm"
)

// API is the part of the mcsm client the bot uses; an interface so the
// command logic can be tested without HTTP.
type API interface {
	Servers(ctx context.Context) ([]mcsm.Server, error)
	Server(ctx context.Context, id string) (mcsm.ServerStatus, error)
	Whitelist(ctx context.Context, id string) ([]mcsm.Player, error)
	AddToWhitelist(ctx context.Context, id, name, claimKey string) (mcsm.WhitelistChange, error)
}

// Bot handles slash commands, the rules button and the username modal.
type Bot struct {
	cfg Config
	api API
	log *slog.Logger

	mu        sync.Mutex
	servers   []mcsm.Server
	fetchedAt time.Time
}

// Long enough to spare mcsm a request per autocomplete keystroke, short
// enough that newly scoped servers show up without a restart.
const serverCacheTTL = time.Minute

// Discord invalidates an interaction token after 15 minutes; mcsm answers
// far sooner, so this only bounds a hung request.
const apiTimeout = 30 * time.Second

const discordMessageLimit = 2000

// The server id travels inside the component custom ids, so a rules post
// keeps working across restarts without the bot storing anything.
const (
	claimButtonPrefix = "mcsm:claim:"
	claimModalPrefix  = "mcsm:claim-modal:"
	playerInputID     = "player"
	// Discord caps custom ids at 100 characters.
	maxCustomIDLength = 100
)

// Real Minecraft accounts have 3-16 characters; mcsm accepts shorter names
// for legacy accounts, but a self-service claim doesn't need them.
var claimNamePattern = regexp.MustCompile(`^[A-Za-z0-9_]{3,16}$`)

var manageGuild = int64(discordgo.PermissionManageGuild)

var commands = []*discordgo.ApplicationCommand{
	{
		Name:        "setup-rules",
		Description: "Post the server rules with a button to get whitelisted",
		// Discord hides the command from everyone else; the handler checks
		// again because guild admins can override this default.
		DefaultMemberPermissions: &manageGuild,
		Contexts:                 &[]discordgo.InteractionContextType{discordgo.InteractionContextGuild},
		Options:                  []*discordgo.ApplicationCommandOption{serverOption()},
	},
	{
		Name:                     "whitelist",
		Description:              "Moderator tools for the Minecraft whitelist",
		DefaultMemberPermissions: &manageGuild,
		Contexts:                 &[]discordgo.InteractionContextType{discordgo.InteractionContextGuild},
		Options: []*discordgo.ApplicationCommandOption{
			{
				Type:        discordgo.ApplicationCommandOptionSubCommand,
				Name:        "list",
				Description: "Show who is whitelisted",
				Options:     []*discordgo.ApplicationCommandOption{serverOption()},
			},
		},
	},
	{
		Name:        "mcstatus",
		Description: "Show whether the Minecraft server is online and who is playing",
		Contexts:    &[]discordgo.InteractionContextType{discordgo.InteractionContextGuild},
		Options:     []*discordgo.ApplicationCommandOption{serverOption()},
	},
}

func serverOption() *discordgo.ApplicationCommandOption {
	return &discordgo.ApplicationCommandOption{
		Type:         discordgo.ApplicationCommandOptionString,
		Name:         "server",
		Description:  "Server (defaults to the configured one)",
		Autocomplete: true,
	}
}

func ptr[T any](v T) *T { return &v }

// HandleInteraction is registered as the discordgo interaction handler.
func (b *Bot) HandleInteraction(s *discordgo.Session, i *discordgo.InteractionCreate) {
	switch i.Type {
	case discordgo.InteractionApplicationCommandAutocomplete:
		b.autocomplete(s, i)
	case discordgo.InteractionApplicationCommand:
		b.command(s, i)
	case discordgo.InteractionMessageComponent:
		b.component(s, i)
	case discordgo.InteractionModalSubmit:
		b.modalSubmit(s, i)
	}
}

// commandInput is a parsed slash command invocation.
type commandInput struct {
	command    string
	subcommand string
	server     string
	focused    string
}

func parseCommand(data discordgo.ApplicationCommandInteractionData) commandInput {
	in := commandInput{command: data.Name}
	options := data.Options
	if len(options) == 1 && options[0].Type == discordgo.ApplicationCommandOptionSubCommand {
		in.subcommand = options[0].Name
		options = options[0].Options
	}
	for _, opt := range options {
		value, _ := opt.Value.(string)
		if opt.Name == "server" {
			in.server = strings.TrimSpace(value)
		}
		if opt.Focused {
			in.focused = strings.TrimSpace(value)
		}
	}
	return in
}

func (b *Bot) autocomplete(s *discordgo.Session, i *discordgo.InteractionCreate) {
	in := parseCommand(i.ApplicationCommandData())
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	servers, err := b.cachedServers(ctx)
	if err != nil {
		b.log.Warn("autocomplete: listing servers failed", "err", err)
	}
	err = s.InteractionRespond(i.Interaction, &discordgo.InteractionResponse{
		Type: discordgo.InteractionApplicationCommandAutocompleteResult,
		Data: &discordgo.InteractionResponseData{Choices: serverChoices(servers, in.focused)},
	})
	if err != nil {
		b.log.Warn("autocomplete: responding failed", "err", err)
	}
}

// serverChoices filters servers by name or id; Discord shows at most 25.
func serverChoices(servers []mcsm.Server, query string) []*discordgo.ApplicationCommandOptionChoice {
	query = strings.ToLower(query)
	choices := []*discordgo.ApplicationCommandOptionChoice{}
	for _, srv := range servers {
		if query != "" && !strings.Contains(strings.ToLower(srv.Name), query) &&
			!strings.Contains(strings.ToLower(srv.ID), query) {
			continue
		}
		choices = append(choices, &discordgo.ApplicationCommandOptionChoice{
			Name:  truncate(serverLabel(srv), 100),
			Value: srv.ID,
		})
		if len(choices) == 25 {
			break
		}
	}
	return choices
}

func (b *Bot) command(s *discordgo.Session, i *discordgo.InteractionCreate) {
	in := parseCommand(i.ApplicationCommandData())
	moderatorOnly := in.command == "setup-rules" || in.command == "whitelist"
	if moderatorOnly && !isModerator(i.Member) {
		b.replyEphemeral(s, i, "You need the Manage Server permission for this.")
		return
	}

	// Rules posts and moderator output stay out of the channel history.
	ephemeral := moderatorOnly
	if !b.ack(s, i, ephemeral) {
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), apiTimeout)
	defer cancel()

	var message string
	switch in.command {
	case "setup-rules":
		message = b.postRules(ctx, s, i.ChannelID, in.server)
	case "whitelist":
		message = b.listWhitelist(ctx, in.server)
	case "mcstatus":
		message = b.status(ctx, in.server)
	default:
		message = "Unknown command."
	}
	b.edit(s, i, message)
}

// isModerator mirrors the commands' default permission so a guild override
// that shows a moderator command to everyone doesn't also unlock it.
func isModerator(member *discordgo.Member) bool {
	return member != nil &&
		member.Permissions&(discordgo.PermissionManageGuild|discordgo.PermissionAdministrator) != 0
}

func (b *Bot) postRules(ctx context.Context, s *discordgo.Session, channelID, explicit string) string {
	server, err := b.resolveServer(ctx, explicit)
	if err != nil {
		return b.fail(err)
	}
	if len(claimModalPrefix)+len(server) > maxCustomIDLength {
		return "That server id is too long to fit in a Discord button."
	}
	rules, err := LoadRules(b.cfg.RulesFile)
	if err != nil {
		b.log.Error("loading rules failed", "file", b.cfg.RulesFile, "err", err)
		return "Could not load the rules file: " + err.Error()
	}

	_, err = s.ChannelMessageSendComplex(channelID, &discordgo.MessageSend{
		Embeds: []*discordgo.MessageEmbed{{
			Title:       rules.Title,
			Description: rules.Body,
			Footer: &discordgo.MessageEmbedFooter{
				Text: "Accepting the rules whitelists one Minecraft account per Discord member.",
			},
		}},
		Components: []discordgo.MessageComponent{
			discordgo.ActionsRow{Components: []discordgo.MessageComponent{
				discordgo.Button{
					Label:    "Accept rules & get whitelisted",
					Style:    discordgo.SuccessButton,
					CustomID: claimButtonPrefix + server,
				},
			}},
		},
		AllowedMentions: &discordgo.MessageAllowedMentions{},
	})
	if err != nil {
		b.log.Error("posting rules failed", "err", err)
		return "Could not post the rules here. Does the bot have permission to send messages in this channel?"
	}
	return fmt.Sprintf("Posted the rules for %s.", code(b.serverName(ctx, server)))
}

// component handles the rules button by asking for the username.
func (b *Bot) component(s *discordgo.Session, i *discordgo.InteractionCreate) {
	server, ok := strings.CutPrefix(i.MessageComponentData().CustomID, claimButtonPrefix)
	if !ok {
		return
	}
	err := s.InteractionRespond(i.Interaction, &discordgo.InteractionResponse{
		Type: discordgo.InteractionResponseModal,
		Data: &discordgo.InteractionResponseData{
			CustomID: claimModalPrefix + server,
			Title:    "Get whitelisted",
			Components: []discordgo.MessageComponent{
				discordgo.ActionsRow{Components: []discordgo.MessageComponent{
					discordgo.TextInput{
						CustomID:    playerInputID,
						Label:       "Minecraft username",
						Style:       discordgo.TextInputShort,
						Placeholder: "Your Java Edition name",
						Required:    true,
						MinLength:   3,
						MaxLength:   16,
					},
				}},
			},
		},
	})
	if err != nil {
		b.log.Warn("opening modal failed", "err", err)
	}
}

func (b *Bot) modalSubmit(s *discordgo.Session, i *discordgo.InteractionCreate) {
	data := i.ModalSubmitData()
	server, ok := strings.CutPrefix(data.CustomID, claimModalPrefix)
	if !ok {
		return
	}
	if i.Member == nil || i.Member.User == nil {
		b.replyEphemeral(s, i, "This only works inside a Discord server.")
		return
	}
	name := strings.TrimSpace(textInputValue(data.Components, playerInputID))
	if !claimNamePattern.MatchString(name) {
		b.replyEphemeral(s, i, "That is not a valid Minecraft username (3-16 letters, digits or underscores).")
		return
	}
	if !b.ack(s, i, true) {
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), apiTimeout)
	defer cancel()
	userID := i.Member.User.ID
	change, err := b.api.AddToWhitelist(ctx, server, name, claimKeyFor(userID))
	if err != nil {
		b.log.Info("claim refused", "user", userID, "player", name, "err", err)
		b.edit(s, i, describeClaimError(err, name))
		return
	}

	message := formatClaim(b.serverName(ctx, server), name, change)
	if b.cfg.WhitelistedRoleID != "" {
		if err := s.GuildMemberRoleAdd(i.GuildID, userID, b.cfg.WhitelistedRoleID); err != nil {
			b.log.Warn("assigning whitelisted role failed", "user", userID, "err", err)
			message += " (I couldn't give you the whitelisted role; please tell a moderator.)"
		}
	}
	b.edit(s, i, message)
}

// claimKeyFor is the opaque key mcsm uses to allow one claim per member.
func claimKeyFor(userID string) string {
	return "discord:" + userID
}

func textInputValue(components []discordgo.MessageComponent, id string) string {
	for _, c := range components {
		row, ok := c.(*discordgo.ActionsRow)
		if !ok {
			continue
		}
		for _, inner := range row.Components {
			if input, ok := inner.(*discordgo.TextInput); ok && input.CustomID == id {
				return input.Value
			}
		}
	}
	return ""
}

func (b *Bot) listWhitelist(ctx context.Context, explicit string) string {
	server, err := b.resolveServer(ctx, explicit)
	if err != nil {
		return b.fail(err)
	}
	players, err := b.api.Whitelist(ctx, server)
	if err != nil {
		return b.fail(err)
	}
	return formatWhitelist(b.serverName(ctx, server), players)
}

func (b *Bot) status(ctx context.Context, explicit string) string {
	server, err := b.resolveServer(ctx, explicit)
	if err != nil {
		return b.fail(err)
	}
	status, err := b.api.Server(ctx, server)
	if err != nil {
		return b.fail(err)
	}
	return formatStatus(status)
}

var errNoServer = errors.New("no server selected")

// resolveServer picks the explicit option, then MCSM_SERVER_ID, then the
// token's only server.
func (b *Bot) resolveServer(ctx context.Context, explicit string) (string, error) {
	if explicit != "" {
		return explicit, nil
	}
	if b.cfg.DefaultServer != "" {
		return b.cfg.DefaultServer, nil
	}
	servers, err := b.cachedServers(ctx)
	if err != nil {
		return "", err
	}
	if len(servers) == 1 {
		return servers[0].ID, nil
	}
	return "", errNoServer
}

func (b *Bot) cachedServers(ctx context.Context) ([]mcsm.Server, error) {
	b.mu.Lock()
	defer b.mu.Unlock()
	if b.servers != nil && time.Since(b.fetchedAt) < serverCacheTTL {
		return b.servers, nil
	}
	servers, err := b.api.Servers(ctx)
	if err != nil {
		return b.servers, err
	}
	b.servers, b.fetchedAt = servers, time.Now()
	return servers, nil
}

func (b *Bot) serverName(ctx context.Context, id string) string {
	servers, _ := b.cachedServers(ctx)
	for _, srv := range servers {
		if srv.ID == id {
			return serverLabel(srv)
		}
	}
	return id
}

func serverLabel(srv mcsm.Server) string {
	if srv.Name != "" {
		return srv.Name
	}
	return srv.ID
}

// code wraps user-controlled text so Discord markdown (e.g. underscores in
// usernames) can't mangle it.
func code(s string) string {
	return "`" + strings.ReplaceAll(s, "`", "'") + "`"
}

func formatClaim(server, requested string, change mcsm.WhitelistChange) string {
	name := requested
	if change.Player != nil && change.Player.Name != "" {
		name = change.Player.Name
	}
	msg := fmt.Sprintf("You're whitelisted on %s as %s. Have fun!", code(server), code(name))
	if change.AppliedVia == "file" {
		msg += " The server is offline right now; you can join once it's back."
	}
	return msg
}

func formatWhitelist(server string, players []mcsm.Player) string {
	if len(players) == 0 {
		return fmt.Sprintf("Nobody is whitelisted on %s.", code(server))
	}
	names := make([]string, len(players))
	for i, p := range players {
		names[i] = code(p.Name)
	}
	return fmt.Sprintf("Whitelist of %s (%d): %s", code(server), len(players), strings.Join(names, ", "))
}

func formatStatus(status mcsm.ServerStatus) string {
	name := code(serverLabel(status.Server))
	switch {
	case !status.Running:
		return fmt.Sprintf("%s is offline.", name)
	case !status.Ready:
		return fmt.Sprintf("%s is starting.", name)
	case status.Players.Count == 0:
		return fmt.Sprintf("%s is online. Nobody is playing right now.", name)
	}
	names := make([]string, len(status.Players.Online))
	for i, p := range status.Players.Online {
		names[i] = code(p)
	}
	return fmt.Sprintf("%s is online with %d playing: %s", name, status.Players.Count, strings.Join(names, ", "))
}

// describeClaimError explains a refused claim to the member who asked.
func describeClaimError(err error, name string) string {
	switch {
	case mcsm.HasReason(err, mcsm.ReasonKeyAlreadyClaimed):
		return "You have already whitelisted an account on this server. Ask a moderator if you need to change it."
	case mcsm.HasReason(err, mcsm.ReasonPlayerAlreadyClaimed):
		return fmt.Sprintf("%s was already claimed by another member. Ask a moderator if that's your account.", code(name))
	case mcsm.HasReason(err, mcsm.ReasonPlayerNotFound):
		return fmt.Sprintf("There is no Minecraft account named %s. Check the spelling (Java Edition names only).", code(name))
	}
	return describeError(err)
}

func (b *Bot) fail(err error) string {
	b.log.Warn("command failed", "err", err)
	return describeError(err)
}

// describeError turns API failures into messages for Discord users; details
// go to the log, not the channel.
func describeError(err error) string {
	var apiErr *mcsm.APIError
	switch {
	case errors.Is(err, errNoServer):
		return "Pick a server with the `server` option (or set MCSM_SERVER_ID)."
	case errors.Is(err, context.DeadlineExceeded):
		return "The Minecraft server manager did not answer in time. Try again in a moment."
	case errors.As(err, &apiErr):
		switch apiErr.StatusCode {
		case http.StatusUnauthorized:
			return "The bot's mcsm API token is invalid, expired or revoked. Please tell a moderator."
		case http.StatusForbidden:
			return "The bot's mcsm API token isn't allowed to do that. Please tell a moderator."
		case http.StatusNotFound:
			return "Not found: " + apiErr.Message
		case http.StatusTooManyRequests:
			return "Too many requests right now. Try again in a minute."
		case http.StatusBadGateway, http.StatusConflict:
			return "The Minecraft server isn't accepting commands right now (is it still starting?). Try again in a minute."
		}
		return "The Minecraft server manager reported an error: " + apiErr.Message
	}
	return "Could not reach the Minecraft server manager. Try again later."
}

func truncate(s string, limit int) string {
	if len([]rune(s)) <= limit {
		return s
	}
	return string([]rune(s)[:limit-1]) + "…"
}

// ack acknowledges the interaction, since mcsm may need a Mojang lookup and
// an RCON round trip — more than the three seconds Discord allows.
func (b *Bot) ack(s *discordgo.Session, i *discordgo.InteractionCreate, ephemeral bool) bool {
	resp := &discordgo.InteractionResponse{Type: discordgo.InteractionResponseDeferredChannelMessageWithSource}
	if ephemeral {
		resp.Data = &discordgo.InteractionResponseData{Flags: discordgo.MessageFlagsEphemeral}
	}
	if err := s.InteractionRespond(i.Interaction, resp); err != nil {
		b.log.Warn("deferring response failed", "err", err)
		return false
	}
	return true
}

func (b *Bot) edit(s *discordgo.Session, i *discordgo.InteractionCreate, message string) {
	_, err := s.InteractionResponseEdit(i.Interaction, &discordgo.WebhookEdit{
		Content: ptr(truncate(message, discordMessageLimit)),
		// Player and server names are user input; never let them ping anyone.
		AllowedMentions: &discordgo.MessageAllowedMentions{},
	})
	if err != nil {
		b.log.Warn("sending response failed", "err", err)
	}
}

func (b *Bot) replyEphemeral(s *discordgo.Session, i *discordgo.InteractionCreate, message string) {
	err := s.InteractionRespond(i.Interaction, &discordgo.InteractionResponse{
		Type: discordgo.InteractionResponseChannelMessageWithSource,
		Data: &discordgo.InteractionResponseData{
			Content:         message,
			Flags:           discordgo.MessageFlagsEphemeral,
			AllowedMentions: &discordgo.MessageAllowedMentions{},
		},
	})
	if err != nil {
		b.log.Warn("responding failed", "err", err)
	}
}
