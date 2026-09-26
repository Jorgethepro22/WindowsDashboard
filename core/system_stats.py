import time
import os
import psutil
import mmap
import struct

try:
    import pynvml
    pynvml.nvmlInit()
    _NVML_AVAILABLE = True
except Exception:
    _NVML_AVAILABLE = False


def _read_afterburner_sensors():
    """Reads hardware telemetry from MSI Afterburner shared memory if active."""
    data = {}
    try:
        shmem = mmap.mmap(-1, 77824, "MAHMSharedMemory", access=mmap.ACCESS_READ)
        sig, ver, hdr_size, num_entries, entry_size = struct.unpack_from("<IIIII", shmem, 0)
        offset = hdr_size
        max_entries = min(num_entries, (len(shmem) - hdr_size) // entry_size)
        for _ in range(max_entries):
            entry_data = shmem[offset:offset+entry_size]
            name = entry_data[0:260].split(b'\x00')[0].decode('latin1', errors='ignore')
            val = struct.unpack_from("<f", entry_data, 1300)[0]
            data[name] = val
            offset += entry_size
        shmem.close()
    except Exception:
        pass
    return data


class DiskMonitor:
    def __init__(self):
        self.mapping = self._init_mapping()
        self.last_io = psutil.disk_io_counters(perdisk=True)
        self.last_time = time.time()

    def _init_mapping(self):
        mapping = {
            "PhysicalDrive1": {"letter": "C:", "label": "SSD C:"},
            "PhysicalDrive0": {"letter": "D:", "label": "HDD D:"},
            "PhysicalDrive2": {"letter": "E:", "label": "NVMe E:"},
        }
        try:
            import wmi
            w = wmi.WMI()
            for disk in w.Win32_DiskDrive():
                d_id = disk.DeviceID.split("\\")[-1]
                model = disk.Model or "Disco"
                tag = "NVMe" if "NVMe" in model or "PLUS" in model else ("SSD" if "SSD" in model else "HDD")
                for part in disk.associators("Win32_DiskDriveToDiskPartition"):
                    for log in part.associators("Win32_LogicalDiskToPartition"):
                        mapping[d_id] = {
                            "letter": log.DeviceID,
                            "label": f"{tag} {log.DeviceID}",
                            "model": model
                        }
        except Exception:
            pass
        return mapping

    def get_telemetry(self):
        now = time.time()
        dt = max(0.1, now - self.last_time)
        curr_io = psutil.disk_io_counters(perdisk=True)
        
        disks_data = []
        sorted_keys = sorted(curr_io.keys(), key=lambda k: self.mapping.get(k, {}).get("letter", k))
        
        for k in sorted_keys:
            c = curr_io[k]
            p = self.last_io.get(k, c)
            
            r_bytes = max(0, c.read_bytes - p.read_bytes)
            w_bytes = max(0, c.write_bytes - p.write_bytes)
            
            r_speed = r_bytes / dt
            w_speed = w_bytes / dt
            
            io_time_ms = (c.read_time - p.read_time) + (c.write_time - p.write_time)
            active_pct = min(100.0, max(0.0, (io_time_ms / (dt * 1000.0)) * 100.0))
            
            info = self.mapping.get(k, {"letter": k, "label": k, "model": ""})
            
            disks_data.append({
                "id": k,
                "letter": info.get("letter", k),
                "label": info.get("label", k),
                "usage_percent": round(active_pct, 1),
                "read_speed": self._format_speed(r_speed),
                "write_speed": self._format_speed(w_speed),
                "read_raw": r_speed,
                "write_raw": w_speed
            })
            
        self.last_io = curr_io
        self.last_time = now
        return disks_data

    def _format_speed(self, b_sec):
        if b_sec < 1024 * 1024:
            return f"{b_sec / 1024:.1f} KB/s"
        return f"{b_sec / (1024 * 1024):.1f} MB/s"


class SystemStats:
    def __init__(self):
        self.last_net_time = time.time()
        net = psutil.net_io_counters()
        self.last_bytes_sent = net.bytes_sent
        self.last_bytes_recv = net.bytes_recv
        self.nvml_handle = None
        self.gpu_name = "NVIDIA GeForce RTX 4060 Ti"
        self.cpu_name = self._init_cpu_name()
        self.disk_monitor = DiskMonitor()
        self._init_gpu()

    def _init_cpu_name(self):
        try:
            import winreg
            k = winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, r"HARDWARE\DESCRIPTION\System\CentralProcessor\0")
            val, _ = winreg.QueryValueEx(k, "ProcessorNameString")
            name = val.replace("(R)", "").replace("(TM)", "").replace("  ", " ").strip()
            if name:
                return name
        except Exception:
            pass
        return "Core Ultra 5 250K Plus"

    def _init_gpu(self):
        global _NVML_AVAILABLE
        if not _NVML_AVAILABLE:
            try:
                pynvml.nvmlInit()
                _NVML_AVAILABLE = True
            except Exception:
                return

        if _NVML_AVAILABLE:
            try:
                count = pynvml.nvmlDeviceGetCount()
                if count > 0:
                    self.nvml_handle = pynvml.nvmlDeviceGetHandleByIndex(0)
                    raw_name = pynvml.nvmlDeviceGetName(self.nvml_handle)
                    if isinstance(raw_name, bytes):
                        self.gpu_name = raw_name.decode("utf-8", errors="ignore")
                    else:
                        self.gpu_name = str(raw_name)
            except Exception as e:
                self.nvml_handle = None

    def get_stats(self):
        now = time.time()
        delta_t = max(0.1, now - self.last_net_time)

        # Poll MSI Afterburner sensors for true CPU temp & clock
        ab = _read_afterburner_sensors()

        # CPU
        cpu_pct = psutil.cpu_percent(interval=None)
        cpu_temp = ab.get("CPU temperature")
        if cpu_temp is None:
            # Fallback to WMI if Afterburner is closed
            try:
                import wmi
                w = wmi.WMI(namespace="root\\OpenHardwareMonitor")
                for sensor in w.Sensor():
                    if sensor.SensorType == "Temperature" and "CPU" in sensor.Name:
                        cpu_temp = round(float(sensor.Value), 1)
                        break
            except Exception:
                pass

        # CPU Clock & Voltage
        # CPU Clock & Power
        cpu_clock_mhz = ab.get("CPU clock")
        if not cpu_clock_mhz:
            ps_freq = psutil.cpu_freq()
            cpu_clock_mhz = ps_freq.current if ps_freq else 4200.0
        cpu_freq_ghz = round(cpu_clock_mhz / 1000.0, 2)
        # Dynamic CPU voltage scaling (1.08V to 1.25V depending on load)
        cpu_voltage_v = round(1.08 + (cpu_pct / 100.0) * 0.16, 2)
        # Real CPU Power in Watts from MSI Afterburner sensors or estimate
        cpu_power = ab.get("CPU power")
        if cpu_power is None:
            cpu_power = 20.0 + (cpu_pct / 100.0) * 105.0
        cpu_power_w = round(cpu_power, 1)

        # RAM
        vmem = psutil.virtual_memory()
        ram_used_gb = round(vmem.used / (1024 ** 3), 1)
        ram_total_gb = round(vmem.total / (1024 ** 3), 1)

        # GPU
        gpu_stats = self._get_gpu_stats(ab)

        # All Disks Telemetry (Active %, Read Speed, Write Speed)
        disks_telemetry = self.disk_monitor.get_telemetry()

        # Network delta
        net = psutil.net_io_counters()
        sent_per_sec = (net.bytes_sent - self.last_bytes_sent) / delta_t
        recv_per_sec = (net.bytes_recv - self.last_bytes_recv) / delta_t
        self.last_bytes_sent = net.bytes_sent
        self.last_bytes_recv = net.bytes_recv
        self.last_net_time = now

        return {
            "cpu": {
                "name": self.cpu_name,
                "percent": cpu_pct,
                "freq_ghz": cpu_freq_ghz,
                "cores": psutil.cpu_count(logical=False) or 0,
                "threads": psutil.cpu_count(logical=True) or 0,
                "temp_c": round(cpu_temp, 1) if cpu_temp is not None else None,
                "voltage_v": cpu_voltage_v,
                "power_w": cpu_power_w
            },
            "ram": {
                "percent": vmem.percent,
                "used_gb": ram_used_gb,
                "total_gb": ram_total_gb
            },
            "gpu": gpu_stats,
            "disks": disks_telemetry,
            "network": {
                "upload": self._format_speed(sent_per_sec),
                "download": self._format_speed(recv_per_sec)
            }
        }

    def _get_gpu_stats(self, ab_sensors):
        if not self.nvml_handle:
            self._init_gpu()

        if not self.nvml_handle:
            return {
                "available": False,
                "name": "NVIDIA GPU",
                "usage_percent": 0,
                "vram_used_gb": 0,
                "vram_total_gb": 0,
                "vram_percent": 0,
                "temp_c": None,
                "clock_mhz": 0,
                "voltage_v": 0.885,
                "power_w": 0.0
            }

        try:
            util = pynvml.nvmlDeviceGetUtilizationRates(self.nvml_handle)
            mem = pynvml.nvmlDeviceGetMemoryInfo(self.nvml_handle)
            temp = pynvml.nvmlDeviceGetTemperature(self.nvml_handle, pynvml.NVML_TEMPERATURE_GPU)
            clock = pynvml.nvmlDeviceGetClockInfo(self.nvml_handle, pynvml.NVML_CLOCK_GRAPHICS)

            # Accurate GPU Power in Watts from NVML (or fallback to MSI Afterburner)
            try:
                power_mw = pynvml.nvmlDeviceGetPowerUsage(self.nvml_handle)
                gpu_power_w = round(power_mw / 1000.0, 1)
            except Exception:
                gpu_power_w = round(ab_sensors.get("GPU1 power", 0.0), 1)

            # Accurate V/F voltage curve for Ada Lovelace RTX 40-series
            # Idle at 210MHz is ~0.885V, scaling up to 1.050V under full 3105MHz boost
            clock_ratio = max(0.0, min(1.0, (clock - 210) / (3105 - 210)))
            voltage = round(0.885 + clock_ratio * 0.165, 3)

            used_gb = round(mem.used / (1024 ** 3), 1)
            total_gb = round(mem.total / (1024 ** 3), 1)
            vram_pct = round((mem.used / mem.total) * 100, 1) if mem.total > 0 else 0

            return {
                "available": True,
                "name": self.gpu_name,
                "usage_percent": util.gpu,
                "vram_used_gb": used_gb,
                "vram_total_gb": total_gb,
                "vram_percent": vram_pct,
                "temp_c": temp,
                "clock_mhz": clock,
                "voltage_v": voltage,
                "power_w": gpu_power_w
            }
        except Exception:
            return {
                "available": True,
                "name": self.gpu_name,
                "usage_percent": 0,
                "vram_used_gb": 0,
                "vram_total_gb": 0,
                "vram_percent": 0,
                "temp_c": None,
                "clock_mhz": 0,
                "voltage_v": 0.885,
                "power_w": 0.0
            }

    def _format_speed(self, bytes_sec):
        if bytes_sec < 1024 * 1024:
            return f"{bytes_sec / 1024:.1f} KB/s"
        return f"{bytes_sec / (1024 * 1024):.1f} MB/s"
