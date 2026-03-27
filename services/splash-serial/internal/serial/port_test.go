package serial

import "testing"

func TestNewPortStoresDevice(t *testing.T) {
	port := NewPort("/dev/ttyUSB0")

	if port.Device() != "/dev/ttyUSB0" {
		t.Fatalf("unexpected device: %q", port.Device())
	}
}
