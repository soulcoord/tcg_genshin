// model.js
// 数据模型层：定义游戏初始状态
import { globalBus } from './eventBus.js';

const initialState = {
    phase: 'PHASE_ROLL',
    players: {
        // 玩家 1 (你)
        p1: {
            activeCharId: 'char_diluc',
            dice: [],
            hand: [
                // 注意：这里将卡牌名字改为了中文
                { id: 'wp_wolf', name: "狼的末路", type: 'Weapon', cost: { count: 3, type: 'Matching' } },
                { id: 'event_paimon', name: "汇流", type: 'Event', cost: { count: 2, type: 'Omni' } }
            ],
            characters: {
                'char_diluc': { 
                    id: 'char_diluc', 
                    name: "迪卢克",
                    hp: 10, maxHp: 10, element: 'Pyro', energy: 0 
                }
            }
        },
        // 玩家 2 (对手)
        p2: {
            activeCharId: 'char_hilichurl',
            characters: {
                'char_hilichurl': {
                    id: 'char_hilichurl',
                    name: "汇流",
                    hp: 8,
                    maxHp: 8,
                    element: 'Cryo', 
                    elementAttachment: 'Cryo' // 自带冰附着
                }
            }
        }
    }
};

// 创建响应式状态：当数据改变时自动触发事件
export function createReactiveState(state) {
    return new Proxy(state, {
        get(target, prop) {
            if (typeof target[prop] === 'object' && target[prop] !== null) {
                return createReactiveState(target[prop]);
            }
            return target[prop];
        },
        set(target, prop, value) {
            target[prop] = value;
            // 通知 View 层更新
            globalBus.emit('STATE_CHANGED', { prop, value, target }); 
            return true;
        }
    });
}

export const gameState = createReactiveState(initialState);