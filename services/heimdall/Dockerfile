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

RUN addgroup --system heimdall && adduser --system --ingroup heimdall heimdall

WORKDIR /app

COPY --from=builder /app/target/release/heimdall /usr/local/bin/heimdall

USER heimdall

EXPOSE 8000

CMD ["heimdall"]
