import { Tray, Menu, nativeImage, app } from 'electron'
import { join } from 'path'

export function createTray(onToggle: () => void): Tray {
  // Use a template image for macOS menu bar (monochrome)
  const iconPath = join(__dirname, '../../build/trayIconTemplate.png')
  let image = nativeImage.createFromPath(iconPath)
  if (image.isEmpty()) {
    // Fallback: small blank template icon so dev doesn't crash when icon missing
    image = nativeImage.createEmpty()
  } else {
    image.setTemplateImage(true)
  }

  const tray = new Tray(image)
  tray.setToolTip('opencontroller')

  const menu = Menu.buildFromTemplate([
    { label: 'opencontroller (⌘⇧Space)', click: onToggle },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() }
  ])

  tray.setContextMenu(menu)
  tray.on('click', onToggle)
  return tray
}
