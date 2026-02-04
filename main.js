// main.js
// 游戏主控制器：负责逻辑组装和循环控制
import { initView } from './view.js';
import { gameFSM, PHASES } from './fsm.js';
import { globalBus } from './eventBus.js'; // 注意这里是 eventBus.js
import { DamagePipeline } from './damagePipeline.js';
import { rollDice } from './dice.js';
import { gameState } from './model.js';
import { CostValidator } from './costValidator.js';

console.log(">>> 游戏引擎启动中...");
initView();

// 延迟 1 秒后开始游戏
setTimeout(() => {
    gameFSM.transitionTo(PHASES.ROLL);
}, 1000);

// --- 核心游戏循环 ---

// 1. 处理投骰子
globalBus.on('CMD_ROLL_DICE', (payload) => {
    const newDice = rollDice(payload.count);
    gameState.players.p1.dice = newDice;
    
    // 投完骰子，延迟一下进入玩家行动
    setTimeout(() => {
        gameFSM.transitionTo(PHASES.ACTION_IDLE);
    }, 1000);
});

// 2. 处理玩家打牌
globalBus.on('ACTION_PLAY_CARD', (data) => {
    // 只有在自己的回合才能动
    if (gameFSM.currentPhase !== PHASES.ACTION_IDLE) {
        console.warn("不是你的回合！");
        return;
    }

    const player = gameState.players.p1;
    const cardIndex = player.hand.findIndex(c => c.id === data.cardId);
    if (cardIndex === -1) return;
    
    const card = player.hand[cardIndex];
    const activeChar = player.characters[player.activeCharId];

    // 2.1 校验费用
    const result = CostValidator.check(player.dice, card.cost, activeChar.element);

    if (result.success) {
        console.log(`支付费用: ${card.cost.count} 个骰子`);
        
        // 2.2 扣费 (使用 filter/splice 的方式会丢失响应性，创建新数组赋值更好)
        const newDicePool = [...player.dice];
        // 从大到小删除索引，防止移位
        result.paidIndices.sort((a, b) => b - a).forEach(index => {
            newDicePool.splice(index, 1);
        });
        player.dice = newDicePool;

        // 2.3 弃牌
        const newHand = [...player.hand];
        newHand.splice(cardIndex, 1);
        player.hand = newHand;
        
        // 2.4 特殊效果：如果是“狼的末路”，直接攻击对手
        if (card.id === 'wp_wolf') {
            console.log(">>> 发动攻击：迪卢克使用元素战技！");
            
            const opponent = gameState.players.p2;
            const targetChar = opponent.characters[opponent.activeCharId];

            const dmgInfo = DamagePipeline.calculate(
                { equipment: { weapon: 'wp_wolf' } },
                targetChar,
                { damage: { base: 3, element: 'Pyro' }, type: 'Skill' }
            );

            console.log(`>>> 造成 ${dmgInfo.value} 点火元素伤害`);
            
            // 扣血 (自动触发 UI 更新)
            targetChar.hp = Math.max(0, targetChar.hp - dmgInfo.value);
        } else {
            console.log(">>> 打出了事件牌，无特殊攻击效果。");
        }

    } else {
        alert(`费用不足！需要 ${card.cost.count} 个匹配元素骰子。`);
    }
});

// 3. 玩家结束回合 -> 切换到对手
globalBus.on('ACTION_END_TURN', () => {
    if (gameFSM.currentPhase === PHASES.ACTION_IDLE) {
        gameFSM.transitionTo(PHASES.OPPONENT_TURN);
    }
});

// 4. 对手 AI 行为
globalBus.on('CMD_OPPONENT_ACT', () => {
    // 模拟 AI 思考 1.5 秒
    setTimeout(() => {
        // 检查游戏是否已经结束
        if (gameFSM.currentPhase === PHASES.GAME_OVER) return;

        console.log(">>> 对手发动普通攻击！");
        
        const p1 = gameState.players.p1;
        const target = p1.characters[p1.activeCharId];

        // 简单模拟造成 2 点物理伤害
        const dmg = 2;
        target.hp = Math.max(0, target.hp - dmg);
        
        console.log(`>>> 玩家受到 ${dmg} 点伤害，剩余血量: ${target.hp}`);

        // 检查玩家是否存活
        if (target.hp > 0) {
            // 回合交还给玩家 (简化规则，不重置骰子)
            gameFSM.transitionTo(PHASES.ACTION_IDLE);
        }
    }, 1500);
});

// 5. 游戏结束
globalBus.on('GAME_OVER', () => {
    gameFSM.transitionTo(PHASES.GAME_OVER);
});