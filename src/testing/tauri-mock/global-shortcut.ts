export async function isRegistered(_accelerator: string): Promise<boolean> {
  return false;
}

export async function register(_accelerator: string, _handler: () => void): Promise<void> {}

export async function unregister(_accelerator: string): Promise<void> {}
