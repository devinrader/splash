package serial

type ConnectionState string

const (
	StateConnecting   ConnectionState = "connecting"
	StateConnected    ConnectionState = "connected"
	StateDisconnected ConnectionState = "disconnected"
	StateError        ConnectionState = "error"
	StateWriteBlocked ConnectionState = "write_blocked"
)

type Port struct {
	device string
}

func NewPort(device string) *Port {
	return &Port{device: device}
}

func (p *Port) Device() string {
	return p.device
}
