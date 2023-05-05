import { isPlainObjectOrArray } from './typeUtils'

export function deepClone(target, cache = new WeakMap()) {
  if (cache.get(target)) {
    return cache.get(target)
  }
  if (isPlainObjectOrArray(target)) {
    const cloneTarget = new target.constructor()
    cache.set(target, cloneTarget)
    const keys = Reflect.ownKeys(target)
    for (let i = keys.length; i--;) {
      const key = keys[i]
      cloneTarget[key] = deepClone(target[key], cache)
    }
    return cloneTarget
  }
  return target
}