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

	var health struct {
		Status  string `json:"status"`
		Message string `json:"message"`
	}
	if err := json.NewDecoder(healthResp.Body).Decode(&health); err != nil {
		t.Fatalf("decode /healthz: %v", err)
	}

	if health.Status != "healthy" {
		t.Fatalf("expected liveness status healthy, got %q", health.Status)
	}

	if health.Message != "Process alive" {
		t.Fatalf("expected liveness message Process alive, got %q", health.Message)
	}

	semanticResp, err := client.Get("http://" + listener.Addr().String() + "/health")
	if err != nil {
		t.Fatalf("get /health: %v", err)
	}
	defer semanticResp.Body.Close()

	if semanticResp.StatusCode != http.StatusOK {
		t.Fatalf("expected /health status %d, got %d", http.StatusOK, semanticResp.StatusCode)
	}

	var semanticHealth struct {
		Status   string `json:"status"`
		StreamID string `json:"stream_id"`
	}
	if err := json.NewDecoder(semanticResp.Body).Decode(&semanticHealth); err != nil {
		t.Fatalf("decode /health: %v", err)
	}

	if semanticHealth.StreamID != "integration-stream" {
		t.Fatalf("expected stream_id integration-stream, got %q", semanticHealth.StreamID)
	}

	if semanticHealth.Status != "degraded" {
		t.Fatalf("expected degraded health status, got %q", semanticHealth.Status)
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

	if !strings.Contains(string(body), "splash_serial_rx_messages_total 1") {
		t.Fatalf("expected rx messages metric, got %q", string(body))
	}

	if !strings.Contains(string(body), "splash_serial_tx_messages_total 2") {
		t.Fatalf("expected tx messages metric, got %q", string(body))
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
		resp, err := client.Get("http://" + addr + "/health")
		if err == nil {
			defer resp.Body.Close()

			var health struct {
				Status   string `json:"status"`
				StreamID string `json:"stream_id"`
			}
			if err := json.NewDecoder(resp.Body).Decode(&health); err == nil && health.StreamID == "updated-stream" && health.Status == "healthy" {
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
