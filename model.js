// model.js
// 数据模型层：定义游戏初始状态
import { globalBus } from './eventBus.js';

// 定义初始卡组 (简化版，实际应有30张)
const STARTING_DECK = [
    { id: 'wp_wolf', name: "狼的末路", type: 'Weapon', cost: { count: 3, type: 'Matching' } },
    { id: 'event_paimon', name: "派蒙", type: 'Support', cost: { count: 3, type: 'Same' } }, // 支援牌
    { id: 'event_strategy', name: "运筹帷幄", type: 'Event', cost: { count: 1, type: 'Common' } },
    { id: 'event_lisu', name: "刘苏", type: 'Support', cost: { count: 1, type: 'Matching' } },
    { id: 'food_lotus', name: "\u83b2\u82b1\u9165", type: 'Event', cost: { count: 1, type: 'Common' } }, // ????
    { id: 'event_bestest', name: "最好的伙伴!", type: 'Event', cost: { count: 2, type: 'Omni' } },
    // ... 填充更多卡牌
];

// 创建角色工厂函数
const createCharacter = (id, name, element, maxHp = 10, maxEnergy = 3) => ({
    id,
    name,
    hp: maxHp,
    maxHp,
    element, // 'Pyro', 'Hydro', 'Anemo', 'Electro', 'Dendro', 'Cryo', 'Geo'
    energy: 0,
    maxEnergy,
    isAlive: true,
    statuses: [], // 角色状态 (e.g., 护心铠, 冻结)
    equipment: [], // 装备 (武器, 圣遗物)
    elementAttachment: null // 附着的元素
});

const initialState = {
    phase: 'PHASE_ROLL',
    roundNumber: 1,
    activePlayerId: 'p1', // 当前行动的玩家

    players: {
        p1: {
            id: 'p1',
            isFirst: true, // 先手权
            hasEndedRound: false, // 是否已宣布结束回合
            activeCharId: 'char_diluc',
            dice: [],
            hand: [], // 手牌
            deck: [...STARTING_DECK, ...STARTING_DECK, ...STARTING_DECK].slice(0, 30), // 30张牌堆

            // 区域
            combatStatuses: [], // 出战状态 (e.g., 结晶盾, 激化领域)
            summons: [], // 召唤物区 (max 4)
            supports: [], // 支援区 (max 4)

            characters: {
                'char_diluc': createCharacter('char_diluc', '\u8fea\u5362\u514b', 'Pyro', 10, 3),
                'char_kaeya': createCharacter('char_kaeya', '凯亚', 'Cryo', 10, 2),
                'char_sucrose': createCharacter('char_sucrose', '砂糖', 'Anemo', 10, 2)
            }
        },
        p2: {
            id: 'p2',
            isFirst: false,
            hasEndedRound: false,
            activeCharId: 'char_fischl',
            dice: [],
            hand: [],
            deck: [...STARTING_DECK], // 简化AI卡组

            combatStatuses: [],
            summons: [],
            supports: [],

            characters: {
                'char_fischl': createCharacter('char_fischl', '\u83f2\u8c22\u5c14', 'Electro', 10, 3),
                'char_collei': createCharacter('char_collei', '柯莱', 'Dendro', 10, 2),
                'char_oceanid': createCharacter('char_oceanid', '纯水精灵', 'Hydro', 10, 3) // 模拟Boss/角色
            }
        }
    }
};

// 创建响应式状态
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
            globalBus.emit('STATE_CHANGED', { prop, value, target }); 
            return true;
        }
    });
}

export const gameState = createReactiveState(initialState);
