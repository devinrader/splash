package serial

import (
	"testing"

	serialport "go.bug.st/serial"
)

func TestNewPortStoresDevice(t *testing.T) {
	port := NewPort("/dev/ttyUSB0")

	if port.Device() != "/dev/ttyUSB0" {
		t.Fatalf("unexpected device: %q", port.Device())
	}
}

func TestNewOSFactoryUsesPentairDefaultMode(t *testing.T) {
	factory := NewOSFactory()

	if factory.mode == nil {
		t.Fatal("expected serial mode")
	}

	if factory.mode.BaudRate != 9600 {
		t.Fatalf("unexpected baud rate: %d", factory.mode.BaudRate)
	}

	if factory.mode.DataBits != 8 {
		t.Fatalf("unexpected data bits: %d", factory.mode.DataBits)
	}

	if factory.mode.Parity != serialport.NoParity {
		t.Fatalf("unexpected parity: %v", factory.mode.Parity)
	}

	if factory.mode.StopBits != serialport.OneStopBit {
		t.Fatalf("unexpected stop bits: %v", factory.mode.StopBits)
	}
}
