export default function createChromStorageSyncPlugin (filters) {
  return store => {
    // Initialize data fetching Chrome storage
    for (let path of Object.keys(filters)) {
      chrome.storage.sync.get(path, (storage) => {
        if (typeof storage[path] === 'undefined') { return }
        store.replaceState(Object.assign(store.state, { [path]: storage[path] }))
      })
    }

    // Listen to store mutations and sync them to Chrome storage
    store.subscribe((mutation, state) => {
      for (let [path, syncMutation] of Object.entries(filters)) {
        if (mutation.type !== syncMutation) { continue }
        const sync = mutation.payload.sync
        if (typeof sync !== 'undefined' && !sync) { continue }

        const payload = { [path]: mutation.payload.data }
        chrome.storage.sync.set(payload, () => {})
      }
    })

    // Sync changes to Chrome storage
    chrome.storage.onChanged.addListener((changes) => {
      for (let [path, syncMutation] of Object.entries(filters)) {
        if (changes[path]) {
          store.commit(syncMutation, { data: changes[path].newValue, sync: false })
        }
      }
    })
  }
}
