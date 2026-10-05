/** Esito della modifica delle proprietà di un dispositivo. */
export type DeviceUpdateResult =
  | { ok: true }
  | {
      ok: false;
      reason:
        | 'DEVICE_NOT_FOUND'
        | 'EMPTY_DEVICE_NAME'
        | 'INVALID_IP_ADDRESS'
        | 'INVALID_OPTIONAL_TEXT'
        | 'DUPLICATE_IP_ADDRESS'
        | 'INVALID_PORT_COUNT'
        | 'PORTS_BELOW_CONNECTION_COUNT'
        | 'INVALID_DEVICE_STATUS';
    };
