export default function logWithTime(type, message) {
  const timestamp = new Date().toISOString(); // e.g., "2025-07-01T10:45:30.123Z"
  const prefix = {
    info: "INFO",
    warn: "WARN",
    error: "ERROR",
  }[type] || "LOG";

  console.log(`[${timestamp}] [${prefix}] ${message}`);
}
