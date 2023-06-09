import { getValByPath, updateValByPath } from './fieldsUtils'
import { isArray, isObject, isPlainObject } from './typeUtils'
import { warn, log } from './log'

export default class BetterSetData {
  constructor(instance, watcher, betterOpts) {
    this.instance = instance
    this.watcher = watcher
    this.betterOpts = betterOpts
    this.updatedData = Object.create(null) // 保存要渲染的数据
    this.setDataCbQueue = [] // setData 回调队列
    this.renderedFlag = false // 本轮是否被渲染过标识
    this.setDataTimeStamp = 0 // setData 开始时间戳
    this.timeConsuming = 0 // setData 结束耗时
    this.setDataTimes = 0 // setData 次数
    this.oriSetData = instance.setData
    this.better()
  }

  // 增强 setData
  better() {
    log('better setData has taken effect ')

    const instance = this.instance
    // 替换 setData 方法为修改后的
    instance.setData = (data, fn, options = {}) => {
      this.setDataTimeStamp = Date.now()
      this.renderedFlag = false

      if (this.betterOpts?.logNative) {
        this.oriSetData.call(instance, data, () => {
          this.timeConsuming += Date.now() - this.setDataTimeStamp
          ++this.setDataTimes
          log('total:', this.setDataTimes, 'timeConsuming:', this.timeConsuming, 'ms')
          fn?.()
        })
        return
      }

      // 提供使用原生方法的选择(不会打印日志)
      if (options.useNative) {
        return this.useNativeSetData(data, fn)
      }

      // 保存回调函数
      if (fn) {
        this.setDataCbQueue.push(fn)
      }

      // 开始 diff 数据
      const keys = Object.keys(data)

      // 数据量较少时优化for--（倒序for循环）最快，数据量较大时while--更快
      // 且for循环结束会销毁内部变量，减少内存占用，while则会占用外部变量
      for (let i = keys.length; i--;) {
        const path = keys[i]
        // 本轮即将被setData的数据也要去重，如果没有再去data对象里找
        const oldVal = this.updatedData[path] || getValByPath(instance.data, path)
        const newVal = data[path]
        this.diff(newVal, oldVal, path, options)
      }

      // 向任务队列中push新任务，在下个时间片统一更新数据，本轮 updatedData 对象继续收集
      wx.nextTick(() => {
        this.performUpdate()
      })
    }
  }

  // 更新数据
  updateData(path, newVal, options) {
    // 收集本轮待更新数据
    this.updatedData[path] = newVal
    // 同步更新值
    if (this.betterOpts?.useSyncData || options.useSyncData) {
      updateValByPath(this.instance.data, path, newVal)
    }
    // 触发watch收集watch回调
    this.watcher?.updateWatchedData(path, newVal)
  }

  // 合并（批量）更新数据（异步更新队列，降低渲染消耗）
  performUpdate() {
    // 任务队列中的performUpdate函数会依次执行，但是只渲染一次，随后清空this.updatedData 和 this.setDataCbQueue
    if (this.renderedFlag) {
      return
    }
    this.renderedFlag = true

    const updatedDataKeys = Object.keys(this.updatedData)
    const dataLen = updatedDataKeys.length

    // 存在要更新数据时或者如果没有数据需要更新，但是有回调时执行
    if (dataLen || this.setDataCbQueue.length) {
      if (this.betterOpts?.logUpdatedData) {
        log('merged setData data:', this.updatedData)
      }

      // 执行合并后的setData
      this.oriSetData.call(this.instance, this.updatedData, () => {
        if (this.betterOpts?.logTimeConsuming) {
          this.timeConsuming += Date.now() - this.setDataTimeStamp
          ++this.setDataTimes
          log('total:', this.setDataTimes, 'timeConsuming:', this.timeConsuming, 'ms')
        }
        this.execSetDataCb()

        // 触发watch回调
        this.watcher?.trigger()
      })
      // 一个时间片内执行一次，执行后清除数据
      this.updatedData = {}
    }
  }

  // 执行本轮所有setData回调
  execSetDataCb() {
    const cbLen = this.setDataCbQueue.length
    if (cbLen) {
      for (let i = cbLen; i--;) {
        // 这里可以使用shift，但是shift较慢，shift额外需要移动数组元素重新编号的操作
        const cb = this.setDataCbQueue[cbLen - i - 1] // 回调执行顺序保证与原生表现一致
        cb?.()
      }
      this.setDataCbQueue.length = 0
    }
  }

  // diff 数据变化
  diff(newVal, oldVal, path, options, isSubProp = false) {
    // 值相等或引用地址相同不更新数据
    if (newVal === oldVal) {
      this.logSameValue(path, newVal)

      // 相同引用地址的数据(仅指当前setData的字段，不关心其子属性是否是同一地址)不会被diff，
      // 也不会进入异步更新队列，而是直接使用原生setData方法，这样的话框架不会起到任何优化作用，所以尽量避免设置一个字段值为会变更的引用类型
      if (!isSubProp && isObject(newVal)) {
        this.useNativeSetData({ [path]: newVal })
        warn(
          'data with the same reference address will not be diff, or put it in the asynchronous update queue, but directly use the native "setData" method, the tool will not play any optimization role, so please avoid this way of writing;',
          '\n field:', `"${path}"`,
          '\n newVal:', newVal,
          '\n oldVal', oldVal,
        )
      }
      return
    }

    // undefined number symbol boolean string null function
    // 以上类型发生变化直接使用新数据
    if (typeof newVal !== 'object' || typeof oldVal !== 'object' || !newVal || !oldVal) {
      return this.updateData(path, newVal, options)
    }

    /**
      * 处理新值旧值都为引用类型的情况
      */

    // 如果类型不同了，例如原来是数组变成对象了，直接使用新数据
    if (newVal.constructor !== oldVal.constructor) {
      return this.updateData(path, newVal, options)
    }

    // 数组和对象分开处理，执行Object.keys() 有一定消耗，值为数组时直接.length即可
    if (isArray(newVal)) {
      let newValLen = newVal.length
      const oldValLen = oldVal.length

      const breakDiff = this.diffLength(newValLen, oldValLen, path, newVal, isSubProp, options)

      if (breakDiff) {
        return
      }

      // 其余情况遍历递归对比子属性
      for (; newValLen--;) {
        const newSubVal = newVal[newValLen]
        const oldSubVal = oldVal[newValLen]
        const subPath = `${path}[${newValLen}]`
        // 递归diff子属性
        this.diff(newSubVal, oldSubVal, subPath, options, true)
      }
      return
    }

    // 对象
    if (isPlainObject(newVal)) {
      const newValKeys = Object.keys(newVal)
      let newValLen = newValKeys.length
      const oldValLen = Object.keys(oldVal).length

      const breakDiff = this.diffLength(newValLen, oldValLen, path, newVal, isSubProp, options)
      if (breakDiff) {
        return
      }

      for (; newValLen--;) {
        const newSubKey = newValKeys[newValLen]
        const newSubVal = newVal[newSubKey]
        const oldSubVal = oldVal[newSubKey]
        const subPath = `${path}.${newSubKey}`
        this.diff(newSubVal, oldSubVal, subPath, options, true)
      }
      return
    }

    // 非上述类型(如 Map，Date等)，直接使用新数据 （触发概率较低）
    return this.updateData(path, newVal, options)
  }

  // 对比长度变化
  diffLength(newValLen, oldValLen, path, newVal, isSubProp, options) {
    const breakDiff = true // 中断diff

    // 不对比长度，即长度增加时接着diff数据，达到复用旧数据的目的，提高渲染性能，适用于分页列表等场景(子属性长度发生变化依旧直接使用新数据)
    if (options.useOldVal && isSubProp) {
      // 全为0，不更新(位运算更快)
      if ((newValLen | oldValLen) === 0) {
        return breakDiff
      }

      // 任意一个为0，直接使用新数据
      // 新值长度小于旧值，直接使用新数据(因为遍历目标是新值，如果新值长度比旧值小，对比时旧值某些键会被忽略，从而无法被更新)
      if ((newValLen && oldValLen) === 0 || (newValLen < oldValLen)) {
        this.updateData(path, newVal, options)
        return breakDiff
      }
      return false
    }

    // 默认需要对比长度变化，当长度发生变化时不再diff直接使用新数据

    // 长度发生变化，直接使用新数据
    if (newValLen !== oldValLen) {
      this.updateData(path, newVal, options)
      return breakDiff
    }

    // 长度没变化，都为0，不更新
    if (newValLen === 0) {
      return breakDiff
    }
    return false
  }

  // 调用原生setData(不会 diff)
  useNativeSetData(data, fn) {
    return this.oriSetData.call(this.instance, data, fn)
  }

  // 输出重复数据
  logSameValue(path, newVal) {
    if (this.betterOpts?.logDuplicateData) {
      log('same value was found: ', path, newVal)
    }
  }
}

