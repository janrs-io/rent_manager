FROM golang:1.25 AS builder

WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY . .

RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o /app/rent_manager .

FROM debian:bookworm-slim

WORKDIR /data

COPY --from=builder /app/rent_manager /usr/local/bin/rent_manager

VOLUME ["/data"]

EXPOSE 8080

CMD ["rent_manager"]
