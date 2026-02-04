// eventBus.js
// 事件总线：负责模块间的通信，解耦逻辑
class EventBus {
    constructor() {
        this.listeners = {};
    }

    // 监听事件
    on(event, callback) {
        if (!this.listeners[event]) {
            this.listeners[event] = [];
        }
        this.listeners[event].push(callback);
    }

    // 触发事件
    emit(event, payload) {
        // 这里的日志保留英文前缀方便快速识别，内容转为中文
        console.log(`[事件] ${event}`, payload || '');
        if (this.listeners[event]) {
            this.listeners[event].forEach(cb => cb(payload));
        }
    }
}

// 导出单例
export const globalBus = new EventBus();