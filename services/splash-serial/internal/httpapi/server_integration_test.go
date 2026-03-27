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
	server.now = func() time.Time {
		return time.Unix(300, 0)
	}
	server.RecordReconnect()
	server.AddBytesRead(11)
	server.ObserveWrite("ok", 4)
	server.ObserveWrite("timeout", 2)
	server.SetConnectedStream("connected", time.Unix(295, 0))

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

	if !strings.Contains(string(body), "splash_serial_connection_state{state=\"connected\"} 1") {
		t.Fatalf("expected connected state metric, got %q", string(body))
	}

	if !strings.Contains(string(body), "splash_serial_reconnect_total 1") {
		t.Fatalf("expected reconnect metric, got %q", string(body))
	}

	if !strings.Contains(string(body), "splash_serial_bytes_read_total 11") {
		t.Fatalf("expected bytes read metric, got %q", string(body))
	}

	if !strings.Contains(string(body), "splash_serial_bytes_written_total 4") {
		t.Fatalf("expected bytes written metric, got %q", string(body))
	}

	if !strings.Contains(string(body), "splash_serial_write_failures_total{write_result=\"timeout\"} 1") {
		t.Fatalf("expected timeout write failure metric, got %q", string(body))
	}

	if !strings.Contains(string(body), "splash_serial_stream_age_seconds 5.000000") {
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

func TestIntegrationServerRunServesUpdatedHealth(t *testing.T) {
	addr := reserveServerAddress(t)

	server := NewServer(addr, HealthState{
		Status:          StatusDegraded,
		StreamID:        "",
		SerialDevice:    "/dev/pts/mock1",
		ConnectionState: "connecting",
		NATS:            DependencyUnknown,
		Configuration:   ConfigurationValid,
	})

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	errCh := make(chan error, 1)
	go func() {
		errCh <- server.Run(ctx)
	}()

	server.UpdateHealth(HealthState{
		Status:          StatusOK,
		StreamID:        "updated-stream",
		SerialDevice:    "/dev/pts/mock1",
		ConnectionState: "connected",
		NATS:            DependencyOK,
		Configuration:   ConfigurationValid,
	})

	client := &http.Client{Timeout: 2 * time.Second}
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		resp, err := client.Get("http://" + addr + "/healthz")
		if err == nil {
			defer resp.Body.Close()

			var health HealthState
			if err := json.NewDecoder(resp.Body).Decode(&health); err == nil && health.StreamID == "updated-stream" && health.Status == StatusOK {
				cancel()

				select {
				case err := <-errCh:
					if err != nil {
						t.Fatalf("server exited with error: %v", err)
					}
				case <-time.After(2 * time.Second):
					t.Fatal("server did not stop after context cancellation")
				}
				return
			}
		}
		time.Sleep(10 * time.Millisecond)
	}

	cancel()
	<-errCh
	t.Fatal("server did not report updated health")
}

func reserveServerAddress(t *testing.T) string {
	t.Helper()

	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("reserve server address: %v", err)
	}
	defer listener.Close()

	return listener.Addr().String()
}
