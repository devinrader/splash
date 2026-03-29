package serial

import (
	"fmt"
	"io"

	serialport "go.bug.st/serial"
)

type ConnectionState string

const (
	StateConnecting   ConnectionState = "connecting"
	StateConnected    ConnectionState = "connected"
	StateDisconnected ConnectionState = "disconnected"
	StateError        ConnectionState = "error"
	StateWriteBlocked ConnectionState = "write_blocked"
)

type Port interface {
	io.ReadWriteCloser
	Device() string
}

type Factory interface {
	Open(device string) (Port, error)
}

type UnsupportedFactory struct{}

func NewUnsupportedFactory() UnsupportedFactory {
	return UnsupportedFactory{}
}

func (UnsupportedFactory) Open(device string) (Port, error) {
	return nil, fmt.Errorf("serial adapter factory is not implemented for %s", device)
}

type OSFactory struct {
	openPort func(name string, mode *serialport.Mode) (serialport.Port, error)
	mode     *serialport.Mode
}

func NewOSFactory() OSFactory {
	return OSFactory{
		openPort: serialport.Open,
		mode: &serialport.Mode{
			BaudRate: 9600,
			DataBits: 8,
			Parity:   serialport.NoParity,
			StopBits: serialport.OneStopBit,
		},
	}
}

func (f OSFactory) Open(device string) (Port, error) {
	openPort := f.openPort
	if openPort == nil {
		openPort = serialport.Open
	}

	mode := f.mode
	if mode == nil {
		mode = NewOSFactory().mode
	}

	port, err := openPort(device, mode)
	if err != nil {
		return nil, err
	}

	return &FilePort{
		device: device,
		port:   port,
	}, nil
}

type FilePort struct {
	device string
	port   serialport.Port
}

func (p *FilePort) Device() string {
	return p.device
}

func (p *FilePort) Read(data []byte) (int, error) {
	return p.port.Read(data)
}

func (p *FilePort) Write(data []byte) (int, error) {
	return p.port.Write(data)
}

func (p *FilePort) Close() error {
	return p.port.Close()
}

type MemoryPort struct {
	device string
}

func NewPort(device string) *MemoryPort {
	return &MemoryPort{device: device}
}

func (p *MemoryPort) Device() string {
	return p.device
}

func (p *MemoryPort) Read(_ []byte) (int, error) {
	return 0, io.EOF
}

func (p *MemoryPort) Write(data []byte) (int, error) {
	return len(data), nil
}

func (p *MemoryPort) Close() error {
	return nil
}
