

export async function importJsQR(){
    return (await import('./assets/jsqr-min' as any)).default as typeof import('jsqr').default
}

export async function importModernScreenshot(){
    return (await import('./assets/modern-screenshot-min' as any)) as typeof import('modern-screenshot')
}