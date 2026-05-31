# Infrarust, built WITH the Docker provider compiled in.
#
# The upstream image (ghcr.io/shadowner/infrarust) is built with no cargo
# features, so the Docker provider (an optional `docker` feature on
# infrarust-core) is compiled out — it logs "docker feature is not enabled,
# ignoring" and discovers zero backends. MCSM relies entirely on that label
# discovery, so we build our own image that mirrors upstream's Dockerfile and
# adds `--features infrarust-core/docker`.
#
# Source is fetched from the upstream repo at a pinned ref so the build is
# self-contained (no vendored Rust source in this repo).

ARG RUST_VERSION=1.94
ARG ALPINE_VERSION=3.21
ARG NODE_VERSION=22
# Upstream ref to build. Matches the version MCSM was running; bump as needed
# (e.g. INFRARUST_REF=main for the latest provider code).
ARG INFRARUST_REF=v2.0.0-alpha.6

# Stage 0: fetch the upstream source at the pinned ref.
FROM docker.io/alpine/git AS source
ARG INFRARUST_REF
WORKDIR /src
RUN git clone --depth 1 --branch "${INFRARUST_REF}" \
    https://github.com/Shadowner/Infrarust.git .

# Stage 1: build the admin frontend (kept to match upstream's build inputs).
FROM docker.io/library/node:${NODE_VERSION}-alpine AS frontend-builder
WORKDIR /frontend
COPY --from=source /src/plugins/infrarust-plugin-admin-api/frontend/ ./
RUN yarn install --frozen-lockfile
RUN yarn generate

# Stage 2: build the Rust binary with the Docker provider enabled.
FROM docker.io/library/rust:${RUST_VERSION}-alpine${ALPINE_VERSION} AS builder

RUN apk add --no-cache \
    musl-dev \
    pkgconfig \
    openssl-dev \
    openssl-libs-static \
    git \
    build-base

WORKDIR /usr/crates/infrarust

COPY --from=source /src/ ./
COPY --from=frontend-builder /frontend/.output/public/ \
     ./plugins/infrarust-plugin-admin-api/frontend/.output/public/

# The Docker provider isn't compiled in any upstream build, so it has a trivial
# duplicate-import bug (E0252) that never gets caught: `labels_to_server_config`
# and `resolve_container_address` are pulled in by both a `pub use labels::{…}`
# and a redundant `use self::labels::{…}`. The names are already in scope via the
# pub use, so drop the redundant import line (the compiler itself suggests it).
RUN sed -i '/^use self::labels::{labels_to_server_config, resolve_container_address};/d' \
    crates/infrarust-core/src/provider/docker/mod.rs

ENV OPENSSL_STATIC=1
ENV RUSTFLAGS="-C target-feature=+crt-static"
# Use Alpine's native gcc as the musl linker. Building for the explicit musl
# target otherwise looks for a `musl-gcc` wrapper that Alpine doesn't ship (its
# plain gcc already targets musl).
ENV CARGO_TARGET_X86_64_UNKNOWN_LINUX_MUSL_LINKER=gcc

# Build for the explicit musl target (amd64 — matches the deploy target and CI).
# Passing --target is important: it makes crt-static apply only to the final
# binary, while host proc-macros/build scripts (which must stay dynamic) are
# built without it — a global crt-static breaks proc-macro crates like
# async-stream-impl.
#
# The only change from upstream: `--features infrarust-core/docker`, which pulls
# in bollard/futures-util and compiles the Docker provider into the binary.
RUN rustup target add x86_64-unknown-linux-musl && \
    echo "Building infrarust ($INFRARUST_REF) with docker feature" && \
    cargo build --release --target x86_64-unknown-linux-musl -p infrarust \
        --features infrarust-core/docker && \
    cp target/x86_64-unknown-linux-musl/release/infrarust /usr/local/bin/infrarust && \
    strip /usr/local/bin/infrarust

# Stage 3: minimal runtime (matches upstream).
FROM scratch AS runtime

COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/
COPY --from=builder /usr/local/bin/infrarust /sbin/infrarust

WORKDIR /app
VOLUME ["/app/config"]
EXPOSE 25565
EXPOSE 8080

ENTRYPOINT ["/sbin/infrarust"]
CMD ["--config", "/app/config/infrarust.toml", "--plugins-dir", "/app/config/plugins", "--servers-dir", "/app/config/servers"]
