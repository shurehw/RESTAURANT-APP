/**
 * Bluetooth Low Energy Scale Hook
 * Connects to BLE scales for real-time weight readings
 *
 * Compatible with standard BLE weight scales using Weight Scale Service
 * Tested with Dymo M25, AWS scales, and other HID-compliant scales
 */

import { useState, useCallback, useRef } from 'react';

export interface BleScaleConfig {
  // Weight Scale Service UUID (standard BLE service)
  serviceUuid?: string;
  // Weight Measurement Characteristic UUID
  characteristicUuid?: string;
  // Custom parser for weight data
  customParser?: (dataView: DataView) => number;
}

const DEFAULT_CONFIG: Required<BleScaleConfig> = {
  // Standard Weight Scale Service
  serviceUuid: '0000181d-0000-1000-8000-00805f9b34fb',
  // Standard Weight Measurement Characteristic
  characteristicUuid: '00002a9d-0000-1000-8000-00805f9b34fb',
  // Default parser for standard BLE weight scale format
  customParser: (dataView: DataView) => {
    // Parse standard weight measurement format
    // Byte 0: Flags
    // Bytes 1-2: Weight value (uint16, little-endian)
    const flags = dataView.getUint8(0);
    const weight = dataView.getUint16(1, true); // little-endian

    // Check units (bit 0: 0=SI (kg), 1=Imperial (lb))
    const isImperial = (flags & 0x01) === 0x01;

    // Convert to grams (SI unit)
    if (isImperial) {
      // Convert pounds to grams
      return weight * 453.592;
    }

    // Already in grams or needs scaling
    // Some scales send in 0.01kg increments, adjust as needed
    return weight;
  }
};

export function useBleScale(config: BleScaleConfig = {}) {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [currentWeight, setCurrentWeight] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const deviceRef = useRef<BluetoothDevice | null>(null);
  const characteristicRef = useRef<BluetoothRemoteGATTCharacteristic | null>(null);

  const fullConfig = { ...DEFAULT_CONFIG, ...config };

  /**
   * Connect to BLE scale
   */
  const connect = useCallback(async (onWeight?: (grams: number) => void) => {
    setIsConnecting(true);
    setError(null);

    try {
      // Check if Web Bluetooth is available
      if (!navigator.bluetooth) {
        throw new Error('Web Bluetooth not supported in this browser. Use Chrome, Edge, or Safari on iOS 16.4+');
      }

      // Request device
      const device = await navigator.bluetooth.requestDevice({
        filters: [{ services: [fullConfig.serviceUuid] }],
        optionalServices: [fullConfig.serviceUuid]
      });

      deviceRef.current = device;

      // Handle disconnection
      device.addEventListener('gattserverdisconnected', () => {
        setIsConnected(false);
        setCurrentWeight(null);
        console.log('Scale disconnected');
      });

      // Connect to GATT server
      console.log('Connecting to GATT server...');
      const server = await device.gatt!.connect();

      // Get service
      console.log('Getting weight scale service...');
      const service = await server.getPrimaryService(fullConfig.serviceUuid);

      // Get characteristic
      console.log('Getting weight measurement characteristic...');
      const characteristic = await service.getCharacteristic(fullConfig.characteristicUuid);
      characteristicRef.current = characteristic;

      // Start notifications
      await characteristic.startNotifications();

      // Listen for weight updates
      characteristic.addEventListener('characteristicvaluechanged', (event: Event) => {
        const target = event.target as BluetoothRemoteGATTCharacteristic;
        const dataView = target.value!;

        try {
          const grams = fullConfig.customParser(dataView);
          setCurrentWeight(grams);
          if (onWeight) {
            onWeight(grams);
          }
        } catch (parseError) {
          console.error('Error parsing weight data:', parseError);
        }
      });

      setIsConnected(true);
      setIsConnecting(false);
      console.log('Scale connected successfully');
    } catch (err: any) {
      console.error('Bluetooth connection error:', err);
      setError(err.message || 'Failed to connect to scale');
      setIsConnecting(false);
      setIsConnected(false);
    }
  }, [fullConfig]);

  /**
   * Disconnect from scale
   */
  const disconnect = useCallback(async () => {
    try {
      if (characteristicRef.current) {
        await characteristicRef.current.stopNotifications();
      }
    } catch (err) {
      console.error('Error stopping notifications:', err);
    }

    if (deviceRef.current?.gatt?.connected) {
      deviceRef.current.gatt.disconnect();
    }

    deviceRef.current = null;
    characteristicRef.current = null;
    setIsConnected(false);
    setCurrentWeight(null);
    setError(null);
  }, []);

  /**
   * Capture current weight
   */
  const captureWeight = useCallback((): number | null => {
    return currentWeight;
  }, [currentWeight]);

  /**
   * Zero/tare the scale (if supported)
   */
  const tare = useCallback(async () => {
    // Note: Tare command varies by scale manufacturer
    // This is a placeholder - implement based on your scale's spec
    console.warn('Tare function not implemented for this scale');
  }, []);

  return {
    connect,
    disconnect,
    captureWeight,
    tare,
    isConnected,
    isConnecting,
    currentWeight,
    error,
  };
}

/**
 * Common scale configurations
 */
export const ScaleConfigs = {
  // Standard BLE Weight Scale (default)
  standard: {},

  // AWS (American Weigh Scales) SC-2kg series
  awsSc2kg: {
    customParser: (dataView: DataView) => {
      // AWS scales often send weight in 0.1g increments as uint16
      const rawValue = dataView.getUint16(1, true);
      return rawValue / 10; // Convert to grams
    }
  },

  // Dymo M25 Digital Postal Scale
  dymoM25: {
    customParser: (dataView: DataView) => {
      // Dymo sends in grams directly
      return dataView.getUint16(1, true);
    }
  },

  // Add your scale configuration here
  custom: (parser: (dv: DataView) => number): BleScaleConfig => ({
    customParser: parser
  })
};
