import './paths'
import Store from 'electron-store'

/** Single store for the main process — multiple `new Store()` instances can corrupt the same on-disk file. */
export const mainStore = new Store()
