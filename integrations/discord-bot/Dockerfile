# Build from this directory: docker build -t mcsm-discord-bot .
FROM golang:1.26-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
# Static binary so the runtime image needs no libc.
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/discord-bot .

# distroless/static ships CA certificates (Discord and mcsm over HTTPS) and
# runs as an unprivileged user.
FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /out/discord-bot /discord-bot
COPY rules.example.md /config/rules.md
ENV RULES_FILE=/config/rules.md
ENTRYPOINT ["/discord-bot"]
