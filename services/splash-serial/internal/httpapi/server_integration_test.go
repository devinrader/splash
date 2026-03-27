//go:build integration

package httpapi

import (
	"context"
	"encoding/json"
	"io"
	"net"
	"net/http"
	"strings"
	"testing"
	"time"
)

func TestIntegrationServerServesHealthzAndMetrics(t *testing.T) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen: %v", err)
	}

	server := NewServer(listener.Addr().String(), HealthState{
		Status:          StatusDegraded,
		StreamID:        "integration-stream",
		SerialDevice:    "/dev/pts/mock0",
		ConnectionState: "connected",
		NATS:            DependencyUnknown,
		Configuration:   ConfigurationValid,
	})

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	errCh := make(chan error, 1)
	go func() {
		errCh <- server.serve(ctx, listener)
	}()

	client := &http.Client{Timeout: 2 * time.Second}

	healthResp, err := client.Get("http://" + listener.Addr().String() + "/healthz")
	if err != nil {
		t.Fatalf("get /healthz: %v", err)
	}
	defer healthResp.Body.Close()

	if healthResp.StatusCode != http.StatusOK {
		t.Fatalf("expected /healthz status %d, got %d", http.StatusOK, healthResp.StatusCode)
	}

	var health HealthState
	if err := json.NewDecoder(healthResp.Body).Decode(&health); err != nil {
		t.Fatalf("decode /healthz: %v", err)
	}

	if health.StreamID != "integration-stream" {
		t.Fatalf("expected stream_id integration-stream, got %q", health.StreamID)
	}

	metricsResp, err := client.Get("http://" + listener.Addr().String() + "/metrics")
	if err != nil {
		t.Fatalf("get /metrics: %v", err)
	}
	defer metricsResp.Body.Close()

	body, err := io.ReadAll(metricsResp.Body)
	if err != nil {
		t.Fatalf("read /metrics: %v", err)
	}

	if !strings.Contains(string(body), "splash_serial_connection_state") {
		t.Fatalf("expected metrics output, got %q", string(body))
	}

	cancel()

	select {
	case err := <-errCh:
		if err != nil {
			t.Fatalf("server exited with error: %v", err)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("server did not stop after context cancellation")
	}
}
