import type { AppSnapshot } from "./state.js";

function gauge(name: string, value: number): string {
  return `${name} ${value}`;
}

export function renderMetrics(snapshot: AppSnapshot): string {
  const activePlugin = snapshot.activePlugin ?? "none";
  const decodeState = snapshot.decode;
  const commandState = snapshot.commands;

  return [
    "# HELP splash_protocol_active_plugin_info Active plugin information.",
    "# TYPE splash_protocol_active_plugin_info gauge",
    `splash_protocol_active_plugin_info{plugin="${activePlugin}"} 1`,
    "# HELP splash_protocol_decode_state Current decode readiness state.",
    "# TYPE splash_protocol_decode_state gauge",
    gauge(`splash_protocol_decode_state{state="${decodeState}"}`, 1),
    "# HELP splash_protocol_command_state Current command readiness state.",
    "# TYPE splash_protocol_command_state gauge",
    gauge(`splash_protocol_command_state{state="${commandState}"}`, 1),
    "# HELP splash_protocol_frames_assembled_total Total assembled frames.",
    "# TYPE splash_protocol_frames_assembled_total counter",
    gauge("splash_protocol_frames_assembled_total", 0),
    "# HELP splash_protocol_frames_decoded_total Total decoded frames.",
    "# TYPE splash_protocol_frames_decoded_total counter",
    gauge("splash_protocol_frames_decoded_total", snapshot.metrics.protocolFramesDecodedTotal),
    "# HELP splash_protocol_frame_validation_failures_total Total frame validation failures.",
    "# TYPE splash_protocol_frame_validation_failures_total counter",
    gauge("splash_protocol_frame_validation_failures_total", 0),
    "# HELP splash_protocol_frames_unidentified_total Total unidentified frames.",
    "# TYPE splash_protocol_frames_unidentified_total counter",
    gauge("splash_protocol_frames_unidentified_total", snapshot.metrics.protocolFramesUnidentifiedTotal),
    "# HELP splash_protocol_normalized_events_total Total normalized events published.",
    "# TYPE splash_protocol_normalized_events_total counter",
    gauge("splash_protocol_normalized_events_total", 0),
    "# HELP splash_protocol_commands_total Total commands accepted.",
    "# TYPE splash_protocol_commands_total counter",
    gauge("splash_protocol_commands_total", 0),
    "# HELP splash_protocol_command_results_total Total command results by status.",
    "# TYPE splash_protocol_command_results_total counter",
    gauge('splash_protocol_command_results_total{status="accepted"}', 0),
    gauge('splash_protocol_command_results_total{status="encoded"}', 0),
    gauge('splash_protocol_command_results_total{status="transmitted"}', 0),
    gauge('splash_protocol_command_results_total{status="completed"}', 0),
    gauge('splash_protocol_command_results_total{status="timed_out"}', 0),
    gauge('splash_protocol_command_results_total{status="failed"}', 0),
    "# HELP splash_protocol_stream_resets_total Total stream resets observed.",
    "# TYPE splash_protocol_stream_resets_total counter",
    gauge("splash_protocol_stream_resets_total", 0),
    "# HELP splash_protocol_correlation_timeouts_total Total command correlation timeouts.",
    "# TYPE splash_protocol_correlation_timeouts_total counter",
    gauge("splash_protocol_correlation_timeouts_total", 0),
    "# HELP splash_protocol_serial_rx_messages_total Total observed serial.rx.raw messages.",
    "# TYPE splash_protocol_serial_rx_messages_total counter",
    gauge("splash_protocol_serial_rx_messages_total", snapshot.metrics.serialRxMessagesTotal),
    "# HELP splash_protocol_serial_tx_messages_total Total observed serial.tx.raw messages.",
    "# TYPE splash_protocol_serial_tx_messages_total counter",
    gauge("splash_protocol_serial_tx_messages_total", snapshot.metrics.serialTxMessagesTotal),
    "# HELP splash_protocol_nats_messages_received_total Total NATS messages received by splash-protocol.",
    "# TYPE splash_protocol_nats_messages_received_total counter",
    gauge("splash_protocol_nats_messages_received_total", snapshot.metrics.natsMessagesReceivedTotal),
    "# HELP splash_protocol_nats_messages_published_total Total NATS messages published by splash-protocol.",
    "# TYPE splash_protocol_nats_messages_published_total counter",
    gauge("splash_protocol_nats_messages_published_total", snapshot.metrics.natsMessagesPublishedTotal)
  ].join("\n");
}
