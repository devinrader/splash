package nats

import "testing"

func TestNewClientStoresURL(t *testing.T) {
	client := NewClient("nats://splash-core.local:4222")

	if client.URL() != "nats://splash-core.local:4222" {
		t.Fatalf("unexpected URL: %q", client.URL())
	}
}
