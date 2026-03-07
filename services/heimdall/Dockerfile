# ─── Build stage ──────────────────────────────────────────────────────────────
FROM rust:1.88-slim AS builder

RUN apt-get update && apt-get install -y --no-install-recommends pkg-config libssl-dev && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY Cargo.toml Cargo.lock ./
COPY src/ src/
COPY migrations/ migrations/

ENV CARGO_BUILD_JOBS=2

RUN cargo build --release

# ─── Runtime stage ────────────────────────────────────────────────────────────
FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl && rm -rf /var/lib/apt/lists/*

# Install dotenvx for encrypted .env decryption at runtime
RUN curl -sfS https://dotenvx.sh | sh

RUN addgroup --system sigil && adduser --system --ingroup sigil sigil

WORKDIR /app

COPY --from=builder /app/target/release/sigil /usr/local/bin/sigil
COPY .env.production .env.production

USER sigil

EXPOSE 8000

CMD ["dotenvx", "run", "-f", ".env.production", "--", "sigil"]
