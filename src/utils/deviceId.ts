export function getOrCreateDeviceId(): string {
  try {
    let id = localStorage.getItem('pr_device_id')
    if (!id) {
      id = `user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      localStorage.setItem('pr_device_id', id)
    }
    return id
  } catch {
    return `user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  }
}
