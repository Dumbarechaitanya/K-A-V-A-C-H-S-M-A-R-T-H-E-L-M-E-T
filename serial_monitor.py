import sys
import time
import serial
import serial.tools.list_ports

def find_esp32_port():
    ports = serial.tools.list_ports.comports()
    # First priority: Look for Silicon Labs / CP210x / CH340 / USB UART
    for port in ports:
        desc = (port.description or "").lower()
        mfg = (getattr(port, 'manufacturer', '') or "").lower()
        if "cp210" in desc or "ch340" in desc or "silicon labs" in desc or "silicon labs" in mfg or "uart" in desc:
            return port.device
    # Second priority: Look for COM7 specifically if present
    for port in ports:
        if port.device == "COM7":
            return "COM7"
    # Fallback to any non-bluetooth port
    for port in ports:
        desc = (port.description or "").lower()
        if "bluetooth" not in desc:
            return port.device
    return "COM7"

def main():
    port = sys.argv[1] if len(sys.argv) > 1 else find_esp32_port()
    baud = int(sys.argv[2]) if len(sys.argv) > 2 else 115200

    if not port:
        print("❌ No ESP32 serial port detected.")
        sys.exit(1)

    print(f"==================================================")
    print(f"🛡️  KAVACH SMART HELMET - LIVE SERIAL MONITOR")
    print(f"📡 Port: {port}  |  Baud Rate: {baud}")
    print(f"Press Ctrl+C to exit monitor.")
    print(f"==================================================\n")

    try:
        ser = serial.Serial(port, baud, timeout=1)
        ser.dtr = False
        ser.rts = False
        time.sleep(0.1)
        ser.reset_input_buffer()

        while True:
            line = ser.readline().decode('utf-8', errors='replace').strip()
            if line:
                # Add timestamp
                ts = time.strftime("[%H:%M:%S]")
                print(f"{ts} {line}")
    except KeyboardInterrupt:
        print("\n⏹️ Monitor stopped.")
    except Exception as e:
        print(f"\n❌ Error on serial connection: {e}")
    finally:
        try:
            ser.close()
        except Exception:
            pass

if __name__ == "__main__":
    main()
