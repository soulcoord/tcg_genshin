// main.js
// 游戏主控制器：负责逻辑组装和循环控制
import { initView } from './view.js';
import { gameFSM, PHASES } from './fsm.js';
import { globalBus } from './eventBus.js';
import { DamagePipeline } from './damagePipeline.js';
import { rollDice } from './dice.js';
import { gameState } from './model.js';
import { CostValidator } from './costValidator.js';

console.log(">>> 游戏引擎启动中...");
initView();


    // ???????
function drawCards(player, count) {
    const hand = Array.isArray(player.hand) ? [...player.hand] : [];
    const deck = Array.isArray(player.deck) ? [...player.deck] : [];
    for (let i = 0; i < count && deck.length > 0; i++) {
        if (hand.length >= 10) break;
        hand.push(deck.shift());
    }
    player.deck = deck;
    player.hand = hand;
}

function shuffleDeck(deck) {
    const arr = [...deck];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}



    // ????????????????????
globalBus.on('DECK_READY', () => {
    gameState.players.p1.deck = shuffleDeck(gameState.players.p1.deck);
    gameState.players.p2.deck = shuffleDeck(gameState.players.p2.deck);
    drawCards(gameState.players.p1, 5);
    drawCards(gameState.players.p2, 5);
    // ?????????????????
    globalBus.emit('SHOW_ACTIVE_SELECT');
});



    // ??????



    // ????????
globalBus.on('CONFIRM_ACTIVE_SELECT', ({ targetId }) => {
    if (targetId && gameState.players.p1.characters[targetId]) {
        gameState.players.p1.activeCharId = targetId;
    }
    gameFSM.transitionTo(PHASES.ROLL);
});




// --- 辅助函数：切换回合逻辑 ---
function handleTurnSwitch(isCombatAction) {
    const p1 = gameState.players.p1;
    const p2 = gameState.players.p2;
    const currentId = gameState.activePlayerId;
    const nextId = currentId === 'p1' ? 'p2' : 'p1';

    // 1. 如果是快速行动，回合权不变
    if (!isCombatAction) {
        console.log(">>> 快速行动，继续保持控制权");
        return;
    }

    // 2. 如果是战斗行动，尝试移交回合
    console.log(">>> 战斗行动结束，切换控制权...");

    // 检查下一位玩家是否已结束回合
    if (gameState.players[nextId].hasEndedRound) {
        if (gameState.players[currentId].hasEndedRound) {
            // 双方都结束 -> 进入结束阶段
            gameFSM.transitionTo(PHASES.END);
        } else {
            // 对手已结束，控制权回到自己（连动）
            console.log(`>>> ${nextId === 'p1' ? '玩家' : '对手'} 已结束回合，继续行动`);
            // 如果是 AI 连动，需要再次触发
            if (currentId === 'p2') setTimeout(() => globalBus.emit('CMD_OPPONENT_ACT'), 1000);
        }
    } else {
        // 正常切换
        gameState.activePlayerId = nextId;
        console.log(`>>> 轮到 ${nextId === 'p1' ? '玩家' : '对手'}`);
        if (nextId === 'p2') {
            globalBus.emit('CMD_OPPONENT_ACT');
        }
    }
}

// --- 核心事件处理 ---

// 1. 投骰子阶段
globalBus.on('CMD_ROLL_DICE_PHASE', () => {
    // 双方投骰子
    gameState.players.p1.dice = rollDice(8);
    gameState.players.p1.dice = gameState.players.p1.dice.slice(0, 16);
    gameState.players.p2.dice = rollDice(8);
    gameState.players.p2.dice = gameState.players.p2.dice.slice(0, 16);
    rerollUsed = false;
    console.log(">>> 双方骰子已投掷");
    
    setTimeout(() => {
        gameFSM.transitionTo(PHASES.ACTION);
    }, 1000);
});

// 2. 玩家打出卡牌 (快速行动)
globalBus.on('ACTION_PLAY_CARD', (data) => {
    if (gameFSM.currentPhase !== PHASES.ACTION || gameState.activePlayerId !== 'p1') {
        console.warn("不是你的回合！");
        return;
    }

    const player = gameState.players.p1;
    const cardIndex = player.hand.findIndex(c => c.id === data.cardId);
    if (cardIndex === -1) return;
    const card = player.hand[cardIndex];

    // 费用检查
    const activeChar = player.characters[player.activeCharId];
    const result = CostValidator.check(player.dice, card.cost, activeChar.element);

    if (result.success) {
        // 扣费
        const newDice = [...player.dice];
        result.paidIndices.sort((a,b) => b-a).forEach(i => newDice.splice(i,1));
        player.dice = newDice;
        
        // 弃牌
        player.hand = player.hand.filter((_, i) => i !== cardIndex); 

        // 执行卡牌效果
        if (card.id === 'food_lotus') {
            activeChar.statuses.push({ name: '莲花酥', type: 'Buff', value: 1 }); 
            console.log(">>> 使用莲花酥：本回合减伤3点");
        } else if (card.id === 'wp_wolf') {
            activeChar.equipment.push(card);
            console.log(">>> 装备狼的末路");
        }
        
        // 判定：打牌通常是快速行动
        handleTurnSwitch(false);
    } else {
        alert("费用不足");
    }
});

// 3. 玩家使用技能 (战斗行动)
globalBus.on('ACTION_USE_SKILL', (data) => {
    if (gameFSM.currentPhase !== PHASES.ACTION || gameState.activePlayerId !== 'p1') return;

    const player = gameState.players.p1;
    const opponent = gameState.players.p2;
    const attacker = player.characters[player.activeCharId];
    const target = opponent.characters[opponent.activeCharId];

    // 获取技能详情（这里简化演示，实际应根据 data.skillId 从 characterDataMap 查）
    const baseDamage = skillData ? getSkillDamage(skillData) : 3;
    const skill = {
        damage: { base: baseDamage, element: attacker.element, type: skillData?.type || 'Skill' },
        cost: { count: getSkillCost(skillData) || 3, type: 'Matching' }
    };
    
    // 技能费用检查
    const costResult = CostValidator.check(player.dice, skill.cost, attacker.element);
    if (!costResult.success) {
        alert("技能费用不足！");
        return;
    }
    
    // 扣除骰子
    const newDice = [...player.dice];
    costResult.paidIndices.sort((a,b) => b-a).forEach(i => newDice.splice(i,1));
    player.dice = newDice;

    console.log(`>>> ${attacker.name} 使用技能攻击 ${target.name}`);
    const ctx = DamagePipeline.calculate(attacker, target, skill, gameState);

    // 应用伤害
    if (ctx.damageValue > 0) {
        target.hp = Math.max(0, target.hp - ctx.damageValue);
        console.log(`>>> 造成 ${ctx.damageValue} 伤害, 剩余HP: ${target.hp}`);
    }

    // 处理副作用 (Switch, Piercing)
    ctx.sideEffects.forEach(effect => {
        if (effect.type === 'REMOVE_STATUS') {
            const t = gameState.players.p1.characters[effect.targetId] || gameState.players.p2.characters[effect.targetId];
            if (t) t.statuses = t.statuses.filter(s => s.name !== effect.statusName);
        }
    });

    // 检查死亡
    if (target.hp === 0) {
        target.isAlive = false;
        console.log(">>> 目标倒下！");
    }

    handleTurnSwitch(true); // 战斗行动 -> 切换
});

// 3.5 切换角色 (新增)
globalBus.on('ACTION_SWITCH_CHAR', (data) => {
    if (gameFSM.currentPhase !== PHASES.ACTION || gameState.activePlayerId !== 'p1') {
        console.warn("不是你的回合！");
        return;
    }

    const player = gameState.players.p1;
    const targetCharId = data.targetId;
    const targetChar = player.characters[targetCharId];

    // 合法性检查
    if (!targetChar || !targetChar.isAlive) {
        console.warn("目标无效或已阵亡");
        return;
    }
    if (player.activeCharId === targetCharId) return;

    // 费用检查：标准切人消耗 1 个任意元素骰
    if (player.dice.length < 1) {
        alert("元素骰子不足！切换角色需要 1 个骰子。");
        return;
    }

    // 扣除骰子 (优先扣除非万能骰，或者简单地扣除第一个)
    const newDice = [...player.dice];
    newDice.shift(); 
    player.dice = newDice;

    // 执行切换
    player.activeCharId = targetCharId;
    console.log(`>>> 玩家切换出战角色: ${targetChar.name}`);

    // 切人通常是战斗行动，会结束回合 (除非有快速切换状态，暂不考虑)
    handleTurnSwitch(true);
});

// 4. 结束回合
globalBus.on('ACTION_END_ROUND', () => {
    if (gameFSM.currentPhase !== PHASES.ACTION || gameState.activePlayerId !== 'p1') return;

    console.log(">>> 玩家宣布结束回合");
    gameState.players.p1.hasEndedRound = true;

    // 抢先手逻辑
    if (!gameState.players.p2.hasEndedRound) {
        gameState.players.p1.isFirst = true;
        gameState.players.p2.isFirst = false;
        console.log(">>> 玩家获得下回合先手");
    }

    handleTurnSwitch(true); // 视为交还控制权
});

// 5. 对手 AI
globalBus.on('CMD_OPPONENT_ACT', () => {
    setTimeout(() => {
        if (gameFSM.currentPhase !== PHASES.ACTION) return;
        
        const ai = gameState.players.p2;
        const player = gameState.players.p1;
        
        // 简单AI：如果有骰子就攻击，否则结束
        if (!ai.hasEndedRound) {
             const attacker = ai.characters[ai.activeCharId];
             const target = player.characters[player.activeCharId];

             console.log(`>>> AI ${attacker.name} 攻击!`);
             const skill = { damage: { base: 2, element: attacker.element, type: 'Normal' } };
             const ctx = DamagePipeline.calculate(attacker, target, skill, gameState);

             target.hp = Math.max(0, target.hp - ctx.damageValue);
             console.log(`>>> 玩家受到 ${ctx.damageValue} 伤害`);

             // AI 结束回合
             ai.hasEndedRound = true;
             if (!player.hasEndedRound) {
                 gameState.players.p2.isFirst = true;
                 gameState.players.p1.isFirst = false;
             }

             handleTurnSwitch(true);
        }
    }, 1000);
});

// 6. 结束阶段结算
globalBus.on('CMD_END_PHASE_SETTLEMENT', () => {
    console.log(">>> 结算结束阶段...");

    // 1. 召唤物结算 (略)

    // 2. 状态持续时间 -1 (略)

    // 3. 抽牌 (每人抽2张)
    drawCards(gameState.players.p1, 2);
    drawCards(gameState.players.p2, 2);
    console.log(">>> 双方各抽2张牌");

    // 进入下一回合
    setTimeout(() => {
        gameState.roundNumber++;
        gameFSM.transitionTo(PHASES.ROLL);
    }, 2000);
});
let rerollUsed = false;
let rerollSelection = [];

globalBus.on('ACTION_REROLL_DICE', () => {
    if (gameFSM.currentPhase !== PHASES.ROLL || rerollUsed) return;
    const player = gameState.players.p1;
    if (!Array.isArray(player.dice) || player.dice.length === 0) return;
    // ???????
    // ?????????
    player.dice = rollDice(8);
    rerollUsed = true;
});

// ???????


    // ??????????
globalBus.on('ACTION_SWITCH_ACTIVE', ({ targetId }) => {
    if (gameFSM.currentPhase !== PHASES.ACTION || gameState.activePlayerId !== 'p1') return;
    const player = gameState.players.p1;
    if (!targetId || targetId === player.activeCharId) return;
    const dice = player.dice || [];
    if (dice.length < 1) return;
    dice.splice(0, 1); // ??1????
    player.dice = dice;
    player.activeCharId = targetId;
    handleTurnSwitch(true);
});

// ???????
    // ??????????
globalBus.on('ACTION_TUNE_CARD', ({ cardId }) => {
    if (gameFSM.currentPhase !== PHASES.ACTION || gameState.activePlayerId !== 'p1') return;
    const player = gameState.players.p1;
    const idx = player.hand.findIndex(c => c.id === cardId);
    if (idx === -1) return;
    if (!player.dice || player.dice.length === 0) return;
    const activeChar = player.characters[player.activeCharId];
    // ??
    player.hand = player.hand.filter((_, i) => i !== idx);
    // ???????

    // ???????????
    player.dice[0] = activeChar.element;
    handleTurnSwitch(false);
});
