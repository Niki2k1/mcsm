package main

import (
	"errors"
	"fmt"
	"os"
	"strings"
	"unicode/utf8"
)

// Rules is the content of the rules embed.
type Rules struct {
	Title string
	Body  string
}

// Discord's embed limits.
const (
	maxEmbedTitle       = 256
	maxEmbedDescription = 4096
)

// Rules files are short Markdown documents; anything this large is a wrong path.
const maxRulesFileBytes = 64 << 10

// LoadRules reads the rules Markdown file.
func LoadRules(path string) (Rules, error) {
	info, err := os.Stat(path)
	if err != nil {
		return Rules{}, err
	}
	if info.Size() > maxRulesFileBytes {
		return Rules{}, fmt.Errorf("%s is larger than %d KiB", path, maxRulesFileBytes>>10)
	}
	raw, err := os.ReadFile(path)
	if err != nil {
		return Rules{}, err
	}
	return ParseRules(string(raw))
}

// ParseRules turns Markdown into an embed: a leading "# Heading" becomes the
// title, the rest is the description, which Discord renders as Markdown.
// Content over Discord's limits is an error rather than silently cut, since a
// truncated rule could change its meaning.
func ParseRules(markdown string) (Rules, error) {
	text := strings.TrimSpace(strings.ReplaceAll(markdown, "\r\n", "\n"))
	rules := Rules{Title: "Server rules", Body: text}

	first, rest, _ := strings.Cut(text, "\n")
	if title, ok := strings.CutPrefix(first, "# "); ok {
		rules.Title = strings.TrimSpace(title)
		rules.Body = strings.TrimSpace(rest)
	}

	if rules.Body == "" {
		return rules, errors.New("the rules file has no rules in it")
	}
	if utf8.RuneCountInString(rules.Title) > maxEmbedTitle {
		return rules, fmt.Errorf("the title is longer than %d characters", maxEmbedTitle)
	}
	if n := utf8.RuneCountInString(rules.Body); n > maxEmbedDescription {
		return rules, fmt.Errorf("the rules are %d characters long; Discord allows %d", n, maxEmbedDescription)
	}
	return rules, nil
}
