package main

import (
	"context"
	"log"
	"os/signal"
	"syscall"

	"gitea.rader.haus/devinrader/splash/services/splash-serial/internal/app"
)

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	application, err := app.New()
	if err != nil {
		log.Fatalf("initialize splash-serial: %v", err)
	}

	if err := application.Run(ctx); err != nil {
		log.Fatalf("run splash-serial: %v", err)
	}
}
