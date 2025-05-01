// 使用 ES modules 导入 three.js 及控制器
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// 多人游戏相关变量
const otherPlayers = new Map(); // 存储其他玩家的信息
let playerId = null; // 当前玩家的ID

// 全局变量
let scene, camera, renderer, controls; // 新增 controls
let battleLogElement;
let mapContainer;
let canvasContainer;
let playerModel, enemyModel;
let playerHealthBar, enemyHealthBar;
let playerMixer, enemyMixer;
let playerActions = {};
let enemyActions = {};
let animationId;
let exitBattleButton;
let monsters = []; // 存储所有怪物的数组
let playerHP = 80; // 玩家血量
let playerMaxHP = 80; // 玩家最大血量
let playerAttack = 15; // 玩家攻击力
let playerDefense = 8; // 玩家防御力
let playerSpeed = 12; // 玩家速度，决定谁先行动和逃跑成功率
let playerLevel = 1; // 玩家等级，影响怪物强度
let currentEnemy; // 当前战斗的敌人
let currentEnemyHP; // 当前敌人血量
let currentEnemyAttack; // 当前敌人攻击力
let currentEnemyDefense; // 当前敌人防御力
let currentEnemySpeed; // 当前敌人速度
let selectedMonster = null; // 存储选中的怪物信息
let playerStatsContainer = null; // 玩家属性框
let baseMarker = null; // XBMU基地标记
let playerCoins = 0; // 玩家金币数量
// 添加全局变量用于存储临时属性降低
let tempStatReduction = {
    attack: 0,
    defense: 0,
    speed: 0
};

// 添加全局变量来跟踪当前回合状态
let isPlayerTurn = false;
let isActionInProgress = false;

// 添加全局变量来跟踪音频是否已初始化
let audioInitialized = false;

// 通用方法：根据缩放级别计算图标大小
function calculateIconSize(zoomLevel, minSize, maxSize) {
    // 缩放范围一般在3-18之间，我们将其映射到minSize到maxSize之间
    // 缩放级别越大（地图越放大），图标尺寸也越大
    return Math.max(minSize, Math.min(maxSize, minSize + (zoomLevel - 3) * ((maxSize - minSize) / 15)));
}

// 初始化高德地图
function initAMap() {
    mapContainer = document.getElementById('map-container');
    const map = new AMap.Map(mapContainer, {
        zoom: 10,
        center: [104.157703, 35.935098] // 将地图中心设为XBMU基地位置
    });
    window.map = map;
    
    // 创建玩家属性面板
    createPlayerStatsPanel();
    
    // 添加XBMU基地标记
    addBaseMarker();
    
    // 尝试加载存档
    const hasLoadedSave = loadGameData();
    console.log("存档加载状态:", hasLoadedSave);
    
    // 如果没有存档或加载失败，生成新怪物
    if (!hasLoadedSave || monsters.length === 0) {
        console.log("生成新怪物");
        generateMonsters(false);
    } else {
        console.log("从存档加载怪物，数量:", monsters.length);
        // 为加载的怪物创建标记
        monsters.forEach(monster => {
            const monsterEl = document.createElement('div');
            monsterEl.className = 'enemy';
            monsterEl.style.display = 'block';
            
            // 根据怪物类型设置不同外观
            let monsterColor;
            switch(monster.type) {
                case 0: monsterColor = 'rgba(255, 0, 0, 0.8)'; break;
                case 1: monsterColor = 'rgba(255, 165, 0, 0.8)'; break;
                case 2: monsterColor = 'rgba(0, 0, 200, 0.8)'; break;
                case 3: monsterColor = 'rgba(0, 200, 0, 0.8)'; break;
            }
            
            const baseSize = calculateIconSize(map.getZoom(), 30, 50);
            monsterEl.style.width = `${baseSize}px`;
            monsterEl.style.height = `${baseSize}px`;
            monsterEl.style.backgroundImage = 'url("/static/images/enemy_icon.png")';
            monsterEl.style.backgroundSize = 'cover';
            monsterEl.style.backgroundRepeat = 'no-repeat';
            monsterEl.style.backgroundColor = 'transparent';
            monsterEl.style.border = `2px solid ${monsterColor}`;
            monsterEl.style.borderRadius = '50%';
            monsterEl.style.boxShadow = `0 0 8px ${monsterColor}`;
            
            const marker = new AMap.Marker({
                position: monster.position,
                content: monsterEl,
                offset: new AMap.Pixel(-baseSize/2, -baseSize/2)
            });
            
            window.map.add(marker);
            
            marker.on('click', function() {
                handleMonsterClick({
                    hp: monster.hp,
                    attack: monster.attack,
                    defense: monster.defense,
                    speed: monster.speed,
                    type: monster.type,
                    level: monster.level,
                    marker: marker,
                    position: monster.position
                });
            });
            
            monster.marker = marker;
        });
    }
    
    // 添加窗口大小变化监听器
    window.addEventListener('resize', function() {
        updateMonsterMarkers();
        updateBaseMarkerSize();
        updatePlayerStatsPanelPosition();
    });
    
    // 添加地图缩放和平移完成事件监听
    map.on('zoomend', function() {
        console.log("地图缩放级别变化，更新图标大小");
        updateMonsterMarkers();
        updateBaseMarkerSize();
    });
    
    map.on('moveend', function() {
        updateMonsterMarkers();
    });
    
    // 添加用户交互事件监听器来启动音频
    document.addEventListener('click', function initAudio() {
        initializeAudio();
        // 移除事件监听器，只执行一次
        document.removeEventListener('click', initAudio);
    });
    
    return map;
}

// 添加XBMU基地标记
function addBaseMarker() {
    // 基地位置坐标
    const basePosition = [104.157703, 35.935098];
    
    // 获取当前缩放级别
    const currentZoom = window.map.getZoom();
    const baseSize = calculateIconSize(currentZoom, 40, 80); // 基地图标基础大小范围40-80px
    
    // 创建基地图标元素
    const baseElement = document.createElement('div');
    baseElement.className = 'base-icon';
    baseElement.style.width = `${baseSize}px`;
    baseElement.style.height = `${baseSize}px`;
    baseElement.style.backgroundImage = 'url("static/images/xbmu.png")';
    baseElement.style.backgroundSize = 'cover';
    baseElement.style.backgroundRepeat = 'no-repeat';
    baseElement.style.backgroundPosition = 'center';
    baseElement.style.cursor = 'pointer';
    baseElement.style.border = '2px solid gold';
    baseElement.style.borderRadius = '50%';
    baseElement.style.boxShadow = '0 0 10px gold';
    
    // 创建标记
    baseMarker = new AMap.Marker({
        position: basePosition,
        content: baseElement,
        offset: new AMap.Pixel(-baseSize/2, -baseSize/2),
        zIndex: 100 // 确保基地在怪物上方显示
    });
    
    // 添加点击事件
    baseMarker.on('click', function() {
        showBaseInfo();
    });
    
    // 添加到地图
    window.map.add(baseMarker);
    console.log("XBMU基地标记已添加到位置:", basePosition);
}

// 更新基地图标大小
function updateBaseMarkerSize() {
    if (!baseMarker || !window.map) return;
    
    const currentZoom = window.map.getZoom();
    const baseSize = calculateIconSize(currentZoom, 40, 80); // 基地图标基础大小范围40-80px
    
    const content = baseMarker.getContent();
    if (content) {
        content.style.width = `${baseSize}px`;
        content.style.height = `${baseSize}px`;
        
        // 调整偏移量，保持居中
        baseMarker.setOffset(new AMap.Pixel(-baseSize/2, -baseSize/2));
    }
}

// 显示基地信息
function showBaseInfo() {
    // 检查是否已存在信息窗口，如果存在则移除
    if (window.baseInfoWindow) {
        window.map.remove(window.baseInfoWindow);
    }
    
    // 创建基地信息内容
    const content = document.createElement('div');
    content.className = 'base-info';
    
    // 检查是否有临时属性降低
    const hasTempReduction = tempStatReduction.attack > 0 || tempStatReduction.defense > 0 || tempStatReduction.speed > 0;
    
    content.innerHTML = `
        <h3>XBMU基地</h3>
        <p>这里可以购买装备</p>
        ${hasTempReduction ? '<p style="color: #ff6b6b;">你的属性暂时降低，需要恢复吗？</p>' : ''}
        <button id="upgrade-attack-btn">提升攻击力 (消耗20金币)</button>
        <button id="upgrade-defense-btn">提升防御力 (消耗20金币)</button>
        <button id="upgrade-speed-btn">提升速度 (消耗20金币)</button>
        ${hasTempReduction ? '<button id="restore-stats-btn" style="background-color: #2ecc71;">恢复属性 (免费)</button>' : ''}
    `;
    
    // 使用与怪物信息窗口相同的样式，但添加一些特别的基地样式
    content.style.backgroundColor = 'rgba(40, 40, 40, 0.9)';
    content.style.borderRadius = '8px';
    content.style.color = 'white';
    content.style.padding = '15px';
    content.style.width = '250px';
    content.style.fontFamily = 'Arial, sans-serif';
    content.style.border = '2px solid gold';
    content.style.boxShadow = '0 0 15px rgba(255, 215, 0, 0.5)';
    
    // 设置按钮样式
    const buttonStyle = `
        display: block;
        width: 100%;
        padding: 8px 0;
        margin-top: 8px;
        border: none;
        border-radius: 4px;
        font-size: 14px;
        cursor: pointer;
        transition: background-color 0.3s;
    `;
    
    // 创建信息窗口
    const infoWindow = new AMap.InfoWindow({
        content: content,
        offset: new AMap.Pixel(0, -30),
        closeWhenClickMap: true
    });
    
    // 保存窗口引用
    window.baseInfoWindow = infoWindow;
    
    // 打开信息窗口
    infoWindow.open(window.map, baseMarker.getPosition());
    
    // 添加按钮点击事件
    setTimeout(() => {
        
        const upgradeAttackBtn = document.getElementById('upgrade-attack-btn');
        if (upgradeAttackBtn) {
            upgradeAttackBtn.style = buttonStyle + 'background-color: #e74c3c; color: white;';
            upgradeAttackBtn.addEventListener('click', function() {
                upgradePlayerStat('attack');
            });
        }
        
        const upgradeDefenseBtn = document.getElementById('upgrade-defense-btn');
        if (upgradeDefenseBtn) {
            upgradeDefenseBtn.style = buttonStyle + 'background-color: #3498db; color: white;';
            upgradeDefenseBtn.addEventListener('click', function() {
                upgradePlayerStat('defense');
            });
        }
        
        const upgradeSpeedBtn = document.getElementById('upgrade-speed-btn');
        if (upgradeSpeedBtn) {
            upgradeSpeedBtn.style = buttonStyle + 'background-color: #9b59b6; color: white;';
            upgradeSpeedBtn.addEventListener('click', function() {
                upgradePlayerStat('speed');
            });
        }
        
        // 添加恢复属性按钮事件
        const restoreStatsBtn = document.getElementById('restore-stats-btn');
        if (restoreStatsBtn) {
            restoreStatsBtn.style = buttonStyle + 'background-color: #2ecc71; color: white;';
            restoreStatsBtn.addEventListener('click', function() {
                // 恢复属性
                playerAttack += tempStatReduction.attack;
                playerDefense += tempStatReduction.defense;
                playerSpeed += tempStatReduction.speed;
                
                // 重置临时属性降低
                tempStatReduction = {
                    attack: 0,
                    defense: 0,
                    speed: 0
                };
                
                // 更新属性面板
                updatePlayerStatsPanel();
                
                // 显示恢复信息
                alert('你的属性已恢复！');
                
                // 关闭基地信息窗口
                if (window.baseInfoWindow) {
                    window.baseInfoWindow.close();
                }
                
                // 保存游戏数据
                saveGameData();
            });
        }
    }, 100);
}

// 升级玩家属性
function upgradePlayerStat(statType) {
    // 定义不同属性的升级成本
    const costs = {
        'attack': 20,
        'defense': 20,
        'speed': 20
    };
    
    const cost = costs[statType];
    
    // 检查玩家金币是否足够
    if (playerCoins < cost) {
        alert(`金币不足！升级${statType === 'attack' ? '攻击力' : statType === 'defense' ? '防御力' : '速度'}需要 ${cost} 金币。`);
        return;
    }
    
    // 扣除金币
    playerCoins -= cost;
    
    let message = '';
    
    switch(statType) {
        case 'attack':
            playerAttack += 4;
            message = `花费 ${cost} 金币，攻击力提升了4点！当前攻击力: ${playerAttack}`;
            break;
        case 'defense':
            playerDefense += 2;
            message = `花费 ${cost} 金币，防御力提升了2点！当前防御力: ${playerDefense}`;
            break;
        case 'speed':
            playerSpeed += 1;
            message = `花费 ${cost} 金币，速度提升了1点！当前速度: ${playerSpeed}`;
            break;
    }
    
    // 更新玩家属性面板
    updatePlayerStatsPanel();
    
    // 显示提示信息
    alert(message);
    
    // 关闭基地信息窗口
    if (window.baseInfoWindow) {
        window.baseInfoWindow.close();
    }
    
    // 在属性升级后保存游戏数据
    saveGameData();
}

// 创建玩家属性面板
function createPlayerStatsPanel() {
    // 检查是否已存在，避免重复创建
    if (playerStatsContainer) {
        return;
    }
    
    console.log("创建玩家属性面板");
    
    // 创建面板容器
    playerStatsContainer = document.createElement('div');
    playerStatsContainer.className = 'player-stats-container';
    
    // 添加标题
    const title = document.createElement('h3');
    title.textContent = '玩家属性';
    playerStatsContainer.appendChild(title);
    
    // 添加血量状态行
    const hpRow = document.createElement('div');
    hpRow.className = 'stat-row hp-stat';
    hpRow.style.display = 'flex';
    hpRow.style.justifyContent = 'space-between';
    hpRow.style.alignItems = 'center';
    hpRow.style.marginBottom = '5px';
    
    const hpLabel = document.createElement('span');
    hpLabel.className = 'stat-label';
    hpLabel.textContent = '生命值:';
    hpLabel.style.width = '60px';
    
    const hpValue = document.createElement('span');
    hpValue.className = 'stat-value';
    hpValue.textContent = `${playerMaxHP}`;
    hpValue.id = 'player-hp-value';
    hpValue.style.width = '30px';
    hpValue.style.textAlign = 'left';
    
    const hpReduction = document.createElement('span');
    hpReduction.className = 'stat-reduction';
    hpReduction.id = 'player-hp-reduction';
    hpReduction.style.width = '40px';
    hpReduction.style.textAlign = 'left';
    
    hpRow.appendChild(hpLabel);
    hpRow.appendChild(hpValue);
    hpRow.appendChild(hpReduction);
    playerStatsContainer.appendChild(hpRow);
    
    // 添加金币状态行
    const coinsRow = document.createElement('div');
    coinsRow.className = 'stat-row coins-stat';
    coinsRow.style.display = 'flex';
    coinsRow.style.justifyContent = 'space-between';
    coinsRow.style.alignItems = 'center';
    coinsRow.style.marginBottom = '5px';
    
    const coinsLabel = document.createElement('span');
    coinsLabel.className = 'stat-label';
    coinsLabel.textContent = '金币:';
    coinsLabel.style.width = '60px';
    
    const coinsValue = document.createElement('span');
    coinsValue.className = 'stat-value';
    coinsValue.textContent = playerCoins;
    coinsValue.id = 'player-coins-value';
    coinsValue.style.width = '30px';
    coinsValue.style.textAlign = 'left';
    
    const coinsReduction = document.createElement('span');
    coinsReduction.className = 'stat-reduction';
    coinsReduction.id = 'player-coins-reduction';
    coinsReduction.style.width = '40px';
    coinsReduction.style.textAlign = 'left';
    
    coinsRow.appendChild(coinsLabel);
    coinsRow.appendChild(coinsValue);
    coinsRow.appendChild(coinsReduction);
    playerStatsContainer.appendChild(coinsRow);
    
    // 添加攻击力状态行
    const attackRow = document.createElement('div');
    attackRow.className = 'stat-row attack-stat';
    attackRow.style.display = 'flex';
    attackRow.style.justifyContent = 'space-between';
    attackRow.style.alignItems = 'center';
    attackRow.style.marginBottom = '5px';
    
    const attackLabel = document.createElement('span');
    attackLabel.className = 'stat-label';
    attackLabel.textContent = '攻击力:';
    attackLabel.style.width = '60px';
    
    const attackValue = document.createElement('span');
    attackValue.className = 'stat-value';
    attackValue.textContent = playerAttack;
    attackValue.id = 'player-attack-value';
    attackValue.style.width = '30px';
    attackValue.style.textAlign = 'left';
    
    const attackReduction = document.createElement('span');
    attackReduction.className = 'stat-reduction';
    attackReduction.id = 'player-attack-reduction';
    attackReduction.style.color = '#ff6b6b';
    attackReduction.style.width = '40px';
    attackReduction.style.textAlign = 'left';
    
    attackRow.appendChild(attackLabel);
    attackRow.appendChild(attackValue);
    attackRow.appendChild(attackReduction);
    playerStatsContainer.appendChild(attackRow);
    
    // 添加防御力状态行
    const defenseRow = document.createElement('div');
    defenseRow.className = 'stat-row defense-stat';
    defenseRow.style.display = 'flex';
    defenseRow.style.justifyContent = 'space-between';
    defenseRow.style.alignItems = 'center';
    defenseRow.style.marginBottom = '5px';
    
    const defenseLabel = document.createElement('span');
    defenseLabel.className = 'stat-label';
    defenseLabel.textContent = '防御力:';
    defenseLabel.style.width = '60px';
    
    const defenseValue = document.createElement('span');
    defenseValue.className = 'stat-value';
    defenseValue.textContent = playerDefense;
    defenseValue.id = 'player-defense-value';
    defenseValue.style.width = '30px';
    defenseValue.style.textAlign = 'left';
    
    const defenseReduction = document.createElement('span');
    defenseReduction.className = 'stat-reduction';
    defenseReduction.id = 'player-defense-reduction';
    defenseReduction.style.color = '#ff6b6b';
    defenseReduction.style.width = '40px';
    defenseReduction.style.textAlign = 'left';
    
    defenseRow.appendChild(defenseLabel);
    defenseRow.appendChild(defenseValue);
    defenseRow.appendChild(defenseReduction);
    playerStatsContainer.appendChild(defenseRow);
    
    // 添加速度状态行
    const speedRow = document.createElement('div');
    speedRow.className = 'stat-row speed-stat';
    speedRow.style.display = 'flex';
    speedRow.style.justifyContent = 'space-between';
    speedRow.style.alignItems = 'center';
    speedRow.style.marginBottom = '5px';
    
    const speedLabel = document.createElement('span');
    speedLabel.className = 'stat-label';
    speedLabel.textContent = '速度:';
    speedLabel.style.width = '60px';
    
    const speedValue = document.createElement('span');
    speedValue.className = 'stat-value';
    speedValue.textContent = playerSpeed;
    speedValue.id = 'player-speed-value';
    speedValue.style.width = '30px';
    speedValue.style.textAlign = 'left';
    
    const speedReduction = document.createElement('span');
    speedReduction.className = 'stat-reduction';
    speedReduction.id = 'player-speed-reduction';
    speedReduction.style.color = '#ff6b6b';
    speedReduction.style.width = '40px';
    speedReduction.style.textAlign = 'left';
    
    speedRow.appendChild(speedLabel);
    speedRow.appendChild(speedValue);
    speedRow.appendChild(speedReduction);
    playerStatsContainer.appendChild(speedRow);
    
    // 添加等级状态行
    const levelRow = document.createElement('div');
    levelRow.className = 'stat-row level-stat';
    levelRow.style.display = 'flex';
    levelRow.style.justifyContent = 'space-between';
    levelRow.style.alignItems = 'center';
    levelRow.style.marginBottom = '5px';
    
    const levelLabel = document.createElement('span');
    levelLabel.className = 'stat-label';
    levelLabel.textContent = '等级:';
    levelLabel.style.width = '60px';
    
    const levelValue = document.createElement('span');
    levelValue.className = 'stat-value';
    levelValue.textContent = playerLevel;
    levelValue.id = 'player-level-value';
    levelValue.style.width = '30px';
    levelValue.style.textAlign = 'left';
    
    const levelReduction = document.createElement('span');
    levelReduction.className = 'stat-reduction';
    levelReduction.id = 'player-level-reduction';
    levelReduction.style.width = '40px';
    levelReduction.style.textAlign = 'left';
    
    levelRow.appendChild(levelLabel);
    levelRow.appendChild(levelValue);
    levelRow.appendChild(levelReduction);
    playerStatsContainer.appendChild(levelRow);
    
    // 将面板添加到地图容器中
    mapContainer.appendChild(playerStatsContainer);
    
    // 更新玩家面板数据
    updatePlayerStatsPanel();
}

// 更新玩家属性面板数据
function updatePlayerStatsPanel() {
    if (!playerStatsContainer) {
        return;
    }
    
    document.getElementById('player-hp-value').textContent = `${playerMaxHP}`;
    document.getElementById('player-attack-value').textContent = playerAttack;
    document.getElementById('player-defense-value').textContent = playerDefense;
    document.getElementById('player-speed-value').textContent = playerSpeed;
    document.getElementById('player-level-value').textContent = playerLevel;
    document.getElementById('player-coins-value').textContent = playerCoins;
    
    // 更新属性降低显示
    const attackReduction = document.getElementById('player-attack-reduction');
    const defenseReduction = document.getElementById('player-defense-reduction');
    const speedReduction = document.getElementById('player-speed-reduction');
    
    if (tempStatReduction.attack > 0) {
        attackReduction.textContent = `(-${tempStatReduction.attack})`;
    } else {
        attackReduction.textContent = '';
    }
    
    if (tempStatReduction.defense > 0) {
        defenseReduction.textContent = `(-${tempStatReduction.defense})`;
    } else {
        defenseReduction.textContent = '';
    }
    
    if (tempStatReduction.speed > 0) {
        speedReduction.textContent = `(-${tempStatReduction.speed})`;
    } else {
        speedReduction.textContent = '';
    }
}

// 更新玩家属性面板位置
function updatePlayerStatsPanelPosition() {
    if (!playerStatsContainer || !mapContainer) {
        return;
    }
    
    // 确保属性面板位于地图的左下角
    playerStatsContainer.style.bottom = '20px';
    playerStatsContainer.style.left = '20px';
}

// 生成怪物并固定在地图经纬度上
function generateMonsters(appendMode = false) {
    console.log("开始生成怪物，追加模式:", appendMode, "当前怪物数量:", monsters.length);
    
    // 如果不是追加模式，则先清除所有现有怪物
    if (!appendMode) {
        monsters.forEach(monster => {
            if (monster.marker) {
                window.map.remove(monster.marker);
            }
        });
        monsters = [];
        console.log("已清除所有现有怪物");
    }
    
    if (!window.map) {
        console.error("地图未初始化，无法生成怪物");
        return;
    }
    
    // 根据是否为追加模式决定生成的怪物数量
    const numMonsters = appendMode ? 
        Math.floor(Math.random() * 5) + 3 : // 追加模式时生成3-7个
        Math.floor(Math.random() * 8) + 5;  // 初始模式时生成5-12个
    
    console.log("正在生成", numMonsters, "个新怪物", appendMode ? "(追加模式)" : "");
    
    // 获取当前地图缩放级别并计算初始图标大小
    const currentZoom = window.map.getZoom();
    const baseSize = calculateIconSize(currentZoom, 24, 48);
    
    // 基地位置 - 用于避免怪物生成在基地附近
    const basePosition = [104.157703, 35.935098];
    const safeRadius = 0.05; // 基地周围安全区半径（约5.5公里）
    
    // 全球范围内生成怪物
    for (let i = 0; i < numMonsters; i++) {
        // 生成全球随机坐标
        let monsterLng = Math.random() * 360 - 180; // 经度范围: -180到180
        let monsterLat = Math.random() * 170 - 85;  // 纬度范围: -85到85 (避免极点)
        
        // 尝试避免怪物生成在基地附近
        let tooCloseToBase = true;
        let attempts = 0;
        
        // 检查是否太靠近基地
        while (tooCloseToBase && attempts < 3) {
            // 计算与基地的距离
            const distance = Math.sqrt(
                Math.pow(monsterLng - basePosition[0], 2) + 
                Math.pow(monsterLat - basePosition[1], 2)
            );
            
            // 如果距离大于安全区半径，则位置有效
            if (distance > safeRadius) {
                tooCloseToBase = false;
            } else {
                // 重新生成位置
                monsterLng = Math.random() * 360 - 180;
                monsterLat = Math.random() * 170 - 85;
                attempts++;
            }
        }
        
        // 随机怪物类型（影响外观和属性）
        const monsterType = Math.floor(Math.random() * 4); // 0-3表示不同类型的怪物
        
        // 生成怪物属性 - 根据玩家等级和怪物类型提高怪物实力
        const levelMultiplier = 1 + (playerLevel - 1) * 0.25; // 每级提高25%
        const typeMultiplier = 1 + monsterType * 0.2; // 不同类型怪物的属性倍率
        
        // 添加更多随机性到怪物属性
        const randomVariance = 0.9 + Math.random() * 0.2; // 随机范围0.9-1.1的变化因子
        
        // 创建怪物等级 - 基于玩家等级但有一定随机性
        const monsterLevel = Math.max(1, Math.floor(playerLevel * (0.9 + Math.random() * 0.2)));
        
        const monsterHP = Math.floor((Math.random() * 25 + 35) * levelMultiplier * typeMultiplier * randomVariance);
        const monsterAttack = Math.floor((Math.random() * 12 + 8) * levelMultiplier * typeMultiplier * randomVariance);
        
        // 添加防御和速度属性，不同类型怪物有不同的属性偏好
        let monsterDefense, monsterSpeed;
        
        switch(monsterType) {
            case 0: // 平衡型怪物
                monsterDefense = Math.floor((Math.random() * 10 + 5) * levelMultiplier * randomVariance);
                monsterSpeed = Math.floor((Math.random() * 14 + 10) * levelMultiplier * randomVariance);
                break;
            case 1: // 高攻击型怪物
                monsterDefense = Math.floor((Math.random() * 6 + 3) * levelMultiplier * randomVariance);
                monsterSpeed = Math.floor((Math.random() * 16 + 8) * levelMultiplier * randomVariance);
                break;
            case 2: // 高防御型怪物
                monsterDefense = Math.floor((Math.random() * 14 + 7) * levelMultiplier * randomVariance);
                monsterSpeed = Math.floor((Math.random() * 10 + 8) * levelMultiplier * randomVariance);
                break;
            case 3: // 高速度型怪物
                monsterDefense = Math.floor((Math.random() * 8 + 4) * levelMultiplier * randomVariance);
                monsterSpeed = Math.floor((Math.random() * 18 + 12) * levelMultiplier * randomVariance);
                break;
        }
        
        // 创建怪物图标元素
        const monsterEl = document.createElement('div');
        monsterEl.className = 'enemy';
        // 确保元素可见
        monsterEl.style.display = 'block';
        
        // 根据怪物类型设置不同外观
        let monsterColor;
        switch(monsterType) {
            case 0: monsterColor = 'rgba(255, 0, 0, 0.8)'; break; // 红色
            case 1: monsterColor = 'rgba(255, 165, 0, 0.8)'; break; // 橙色
            case 2: monsterColor = 'rgba(0, 0, 200, 0.8)'; break; // 蓝色
            case 3: monsterColor = 'rgba(0, 200, 0, 0.8)'; break; // 绿色
        }
        
        // 添加怪物图标样式
        monsterEl.style.width = `${baseSize}px`;
        monsterEl.style.height = `${baseSize}px`;
        monsterEl.style.backgroundImage = 'url("/static/images/enemy_icon.png")';
        monsterEl.style.backgroundSize = 'cover';
        monsterEl.style.backgroundRepeat = 'no-repeat';
        monsterEl.style.backgroundColor = 'transparent';
        monsterEl.style.border = `2px solid ${monsterColor}`;
        // 确保始终是圆形边框 - 修复形状问题
        monsterEl.style.borderRadius = '50%';
        monsterEl.style.boxShadow = `0 0 8px ${monsterColor}`;
        
        // 创建标记并添加到地图
        const marker = new AMap.Marker({
            position: [monsterLng, monsterLat],
            content: monsterEl,
            offset: new AMap.Pixel(-baseSize/2, -baseSize/2) // 根据大小动态调整偏移量
        });
        
        // 将标记添加到地图
        window.map.add(marker);
        
        // 添加点击事件
        marker.on('click', function() {
            handleMonsterClick({
                hp: monsterHP,
                attack: monsterAttack,
                defense: monsterDefense,
                speed: monsterSpeed,
                type: monsterType,
                level: monsterLevel,
                marker: marker,
                position: [monsterLng, monsterLat]
            });
        });
        
        // 保存怪物信息
        monsters.push({
            marker: marker,
            hp: monsterHP,
            attack: monsterAttack,
            defense: monsterDefense,
            speed: monsterSpeed,
            type: monsterType,
            level: monsterLevel,
            position: [monsterLng, monsterLat]
        });
    }
    
    // 确保所有怪物标记可见
    updateMonsterMarkers();
}

// 强化更新怪物标记位置的函数
function updateMonsterMarkers() {
    console.log("更新怪物标记位置，当前怪物数量:", monsters.length);
    
    // 如果怪物数量为0，尝试重新生成
    if (monsters.length === 0) {
        console.log("没有怪物，尝试重新生成");
        setTimeout(() => generateMonsters(false), 500);
        return;
    }
    
    // 获取当前地图缩放级别并计算图标大小
    const currentZoom = window.map.getZoom();
    // 使用通用的计算图标大小方法
    const baseSize = calculateIconSize(currentZoom, 24, 48);
    console.log(`当前缩放级别: ${currentZoom}, 怪物图标尺寸: ${baseSize}px`);
    
    monsters.forEach(monster => {
        if (monster.marker) {
            // 确保标记位置正确
            monster.marker.setPosition(monster.position);
            
            // 确保标记内容可见并根据缩放级别调整大小
            const content = monster.marker.getContent();
            if (content) {
                content.style.display = 'block';
                content.style.visibility = 'visible';
                content.style.opacity = '1';
                
                // 根据缩放级别动态调整图标大小
                content.style.width = `${baseSize}px`;
                content.style.height = `${baseSize}px`;
                content.style.backgroundImage = 'url("static/images/enemy_icon.png")';
                content.style.backgroundSize = 'cover';
                
                // 一定要设置为圆形 - 修复边框形状问题
                content.style.borderRadius = '50%';
                
                // 根据怪物类型设置不同的边框颜色
                let borderColor;
                // 确保monster.type存在，否则默认为0
                const monsterType = monster.type !== undefined ? monster.type : 0;
                
                switch(monsterType) {
                    case 0: borderColor = 'rgba(255, 0, 0, 0.8)'; break; // 红色
                    case 1: borderColor = 'rgba(255, 165, 0, 0.8)'; break; // 橙色
                    case 2: borderColor = 'rgba(0, 0, 200, 0.8)'; break; // 蓝色
                    case 3: borderColor = 'rgba(0, 200, 0, 0.8)'; break; // 绿色
                    default: borderColor = 'rgba(255, 0, 0, 0.8)'; // 默认红色
                }
                
                content.style.border = `2px solid ${borderColor}`;
                content.style.boxShadow = `0 0 8px ${borderColor}`;
                
                // 调整标记的偏移量，使图标始终居中
                const offset = -baseSize / 2;
                monster.marker.setOffset(new AMap.Pixel(offset, offset));
            }
        } else {
            console.warn("怪物标记不存在", monster);
        }
    });
    
    console.log("更新完成，当前怪物数量:", monsters.length);
}

// 处理怪物点击事件
function handleMonsterClick(monster) {
    selectedMonster = monster;
    
    // 显示怪物属性和战斗按钮
    showMonsterInfo(monster);
}

// 显示怪物属性和战斗按钮
function showMonsterInfo(monster) {
    // 检查是否已存在信息窗口，如果存在则移除
    if (window.monsterInfoWindow) {
        window.monsterInfoWindow.close();
    }
    
    // 获取怪物类型名称
    let monsterTypeName = "普通怪物";
    let typeColor = "#ffffff";
    
    // 确保monster.type存在，否则默认为0
    const monsterType = monster.type !== undefined ? monster.type : 0;
    
    console.log("显示怪物信息，类型:", monsterType);
    
    switch(monsterType) {
        case 0: 
            monsterTypeName = "平衡型怪物"; 
            typeColor = "#ff5555";
            break;
        case 1: 
            monsterTypeName = "高攻击型怪物"; 
            typeColor = "#ffa502";
            break;
        case 2: 
            monsterTypeName = "高防御型怪物"; 
            typeColor = "#3498db";
            break;
        case 3: 
            monsterTypeName = "高速度型怪物"; 
            typeColor = "#2ecc71";
            break;
    }
    
    // 获取怪物等级，如果不存在则默认为1
    const monsterLevel = monster.level || 1;
    
    // 创建怪物信息内容
    const content = document.createElement('div');
    content.className = 'monster-info';
    content.innerHTML = `
        <h3 style="color:${typeColor}">${monsterTypeName}</h3>
        <p>等级: <span style="color:${typeColor}">${monsterLevel}</span></p>
        <p>生命值: <span style="color:${typeColor}">${monster.hp}</span></p>
        <p>攻击力: <span style="color:${typeColor}">${monster.attack}</span></p>
        <p>防御力: <span style="color:${typeColor}">${monster.defense}</span></p>
        <p>速度: <span style="color:${typeColor}">${monster.speed}</span></p>
        <p>类型: <span style="color:${typeColor}">${monsterTypeName}</span></p>
        <button id="battle-start-btn">开始战斗</button>
    `;
    
    // 创建信息窗口
    const infoWindow = new AMap.InfoWindow({
        content: content,
        offset: new AMap.Pixel(0, -30)
    });
    
    // 保存窗口引用
    window.monsterInfoWindow = infoWindow;
    
    // 在怪物位置打开信息窗口
    infoWindow.open(window.map, monster.position);
    
    // 添加战斗按钮点击事件
    setTimeout(() => {
        const battleBtn = document.getElementById('battle-start-btn');
        if (battleBtn) {
            battleBtn.addEventListener('click', function() {
                startBattleWithMonster(monster);
            });
        }
    }, 100);
}

// 开始与怪物战斗
function startBattleWithMonster(monster) {
    // 关闭信息窗口
    if (window.monsterInfoWindow) {
        window.monsterInfoWindow.close();
    }
    
    // 保存当前怪物的引用，用于战斗结束后刷新怪物状态
    currentEnemy = monster;
    
    // 设置当前战斗的敌人数据
    currentEnemyHP = monster.hp;
    currentEnemyAttack = monster.attack;
    currentEnemyDefense = monster.defense;
    currentEnemySpeed = monster.speed;
    
    // 准备玩家数据 - 始终使用满血状态
    const playerData = { 
        hp: playerMaxHP, // 修改这里，使用最大血量而不是当前血量
        attack: playerAttack,
        defense: playerDefense,
        speed: playerSpeed
    };
    
    // 使用怪物等级，如果没有则默认为1
    const monsterLevel = monster.level || 1;
    
    const enemyData = { 
        hp: currentEnemyHP, 
        attack: currentEnemyAttack,
        defense: currentEnemyDefense,
        speed: currentEnemySpeed,
        type: monster.type,  // 确保传递怪物类型
        level: monsterLevel  // 添加怪物等级
    };
    
    console.log("战斗开始，怪物数据:", monster);
    
    // 启动战斗
    window.startBattle(playerData, enemyData);
    
    // 播放战斗音乐
    const battleMusic = document.getElementById('battle-music');
    if (battleMusic && audioInitialized) {
        battleMusic.currentTime = 0;
        battleMusic.play().catch(error => {
            console.log('战斗音乐播放失败:', error);
        });
    }
}

// 初始化 Three.js 场景
function initBattleScene() {
    // 清除所有旧元素
    const oldCanvas = document.getElementById('battle-canvas');
    if (oldCanvas && oldCanvas.parentNode) {
        oldCanvas.parentNode.removeChild(oldCanvas);
    }
    
    // 清除所有敌人元素
    document.querySelectorAll('.enemy').forEach(enemy => {
        if (enemy.parentNode) {
            enemy.parentNode.removeChild(enemy);
        }
    });

    // 暂停地图背景音乐
    const mapMusic = document.getElementById('map-music');
    if (mapMusic) {
        mapMusic.pause();
    }
    
    // 播放战斗背景音乐
    const battleMusic = document.getElementById('battle-music');
    if (battleMusic) {
        battleMusic.currentTime = 0;
        battleMusic.volume = 0.2; // 降低音量，从0.5减小到0.2
        battleMusic.play();
    }

    mapContainer.style.display = 'none';
    canvasContainer = document.getElementById('battle-container');
    canvasContainer.style.display = 'block';
    
    // 创建新的canvas
    const battleCanvas = document.createElement('canvas');
    battleCanvas.id = 'battle-canvas';
    canvasContainer.appendChild(battleCanvas);
    
    console.log('战斗场景初始化完成');
    scene = new THREE.Scene();
    
    // 设置场景背景色为天蓝色
    scene.background = new THREE.Color(0x87CEEB);
    
    // 添加场景雾效，增加远景深度感
    scene.fog = new THREE.FogExp2(0x87CEEB, 0.008);

    // 调整相机位置和角度
    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 5, 12); // 调整相机位置，拉远一些，以便看到更大的模型
    camera.lookAt(0, 1, 0); // 将相机视点稍微提高，避免看向地面

    // 设置渲染器并调整大小
    renderer = new THREE.WebGLRenderer({ 
        canvas: document.getElementById('battle-canvas'), 
        antialias: true
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true; // 启用阴影渲染
    renderer.shadowMap.type = THREE.PCFSoftShadowMap; // 使用柔和阴影
    renderer.setClearColor(0x87CEEB); // 设置渲染器清除颜色为天蓝色

    // 添加窗口大小变化监听
    window.addEventListener('resize', handleWindowResize);

    // 初始化轨道控制器并设置限制
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; // 启用阻尼效果，让控制更平滑
    controls.dampingFactor = 0.05;
    controls.enableZoom = true;
    controls.enablePan = false; // 禁用平移
    controls.minDistance = 6; // 最小距离
    controls.maxDistance = 18; // 最大距离
    
    // 限制垂直旋转角度，防止视角穿透到地面以下
    controls.minPolarAngle = Math.PI / 6; // 约30度
    controls.maxPolarAngle = Math.PI / 2; // 90度（水平线）
    
    // 限制水平旋转，使其始终围绕战斗场景
    controls.target.set(0, 1, 0); // 设置旋转中心点为略高于地面的位置

    // 增强环境光亮度
    const ambientLight = new THREE.AmbientLight(0x808080); // 原 0x404040 改为 0x808080
    scene.add(ambientLight);

    // 主方向光（模拟太阳光）
    const sunLight = new THREE.DirectionalLight(0xffffeb, 1.2);
    sunLight.position.set(5, 10, 7);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 1024;
    sunLight.shadow.mapSize.height = 1024;
    sunLight.shadow.camera.near = 0.5;
    sunLight.shadow.camera.far = 30;
    sunLight.shadow.camera.left = -10;
    sunLight.shadow.camera.right = 10;
    sunLight.shadow.camera.top = 10;
    sunLight.shadow.camera.bottom = -10;
    scene.add(sunLight);

    // 添加半球光
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.8);
    scene.add(hemiLight);

    battleLogElement = document.getElementById('battle-log');
    exitBattleButton = document.getElementById('exit-battle-button');
    exitBattleButton.style.display = 'none';

    const loader = new GLTFLoader();

    // 顺序加载模型
    function loadSkyBox(callback) {
        // 创建远景山脉
        createMountains();
        
        // 创建纹理加载器
        const textureLoader = new THREE.TextureLoader();
        
        // 加载草地纹理
        const grassTexturePath = '/static/images/grass.jpg';
        console.log('正在加载草地纹理:', grassTexturePath);
        
        textureLoader.load(grassTexturePath, function(texture) {
            // 创建更大的地面系统

            // 1. 主战斗区域 - 高质量圆形草地
            const battleRadius = 25; // 增加主战场半径从20到25
            const battleGeometry = new THREE.CircleGeometry(battleRadius, 64);
            
            // 设置纹理重复
            texture.wrapS = THREE.RepeatWrapping;
            texture.wrapT = THREE.RepeatWrapping;
            texture.repeat.set(12, 12); // 增加纹理重复次数，从8增加到12
            
            // 创建主战场地面材质
            const battleGroundMaterial = new THREE.MeshStandardMaterial({ 
                map: texture,
                roughness: 0.8,
                metalness: 0.2,
                color: 0x88bb55 // 微微调整草地色调为稍绿
            });
            
            // 创建主战场地面
            const battleGround = new THREE.Mesh(battleGeometry, battleGroundMaterial);
            battleGround.rotation.x = -Math.PI / 2; // 水平放置
            battleGround.position.set(0, -1, 0);
            battleGround.receiveShadow = true;
            scene.add(battleGround);
            
            // 2. 创建中间过渡区域 - 质量略低的圆环
            const midRadius = 60; // 中间地带半径
            const midRingGeometry = new THREE.RingGeometry(battleRadius, midRadius, 64, 4);
            
            // 克隆并修改纹理
            const midTexture = texture.clone();
            midTexture.needsUpdate = true;
            midTexture.repeat.set(30, 30); // 更大的重复
            
            const midGroundMaterial = new THREE.MeshStandardMaterial({
                map: midTexture,
                roughness: 0.9,
                metalness: 0.1,
                color: 0x739349 // 稍深的绿色
            });
            
            const midGround = new THREE.Mesh(midRingGeometry, midGroundMaterial);
            midGround.rotation.x = -Math.PI / 2;
            midGround.position.set(0, -1.1, 0);
            midGround.receiveShadow = true;
            scene.add(midGround);
            
            // 3. 创建远景区域 - 低质量圆环
            const farRadius = 200; // 远景区域半径
            const farRingGeometry = new THREE.RingGeometry(midRadius, farRadius, 64, 4);
            
            // 克隆并修改纹理
            const farTexture = texture.clone();
            farTexture.needsUpdate = true;
            farTexture.repeat.set(50, 50); // 最大的重复
            
            const farGroundMaterial = new THREE.MeshStandardMaterial({
                map: farTexture,
                roughness: 1.0,
                metalness: 0.0,
                color: 0x4a6b2d // 最深的绿色
            });
            
            const farGround = new THREE.Mesh(farRingGeometry, farGroundMaterial);
            farGround.rotation.x = -Math.PI / 2;
            farGround.position.set(0, -1.2, 0);
            farGround.receiveShadow = true;
            scene.add(farGround);
            
            // 添加岩石
            addRocks();
            
            // 添加树木
            addTrees();
            
            // 添加云朵
            createClouds();
            
            if (callback) callback();
        });
    }
    
    // 创建程序化的云朵
    function createClouds() {
        // 创建平面几何体作为云朵
        const cloudMaterial = new THREE.MeshLambertMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.7
        });
        
        for(let i=0; i<15; i++) {
            // 创建包含多个球体的云朵组
            const cloudGroup = new THREE.Group();
            
            // 云朵的基本尺寸
            const baseSize = Math.random() * 10 + 15;
            
            // 添加5-8个球体组成一朵云
            const sphereCount = Math.floor(Math.random() * 4) + 5;
            for(let j=0; j<sphereCount; j++) {
                const size = Math.random() * 8 + 5;
                const cloudSphere = new THREE.Mesh(
                    new THREE.SphereGeometry(size, 8, 8),
                    cloudMaterial
                );
                
                // 随机位置，但保持在一个区域内
                cloudSphere.position.set(
                    Math.random() * baseSize - baseSize/2,
                    Math.random() * 5 - 2.5,
                    Math.random() * baseSize - baseSize/2
                );
                
                cloudGroup.add(cloudSphere);
            }
            
            // 随机位置
            cloudGroup.position.set(
                Math.random() * 400 - 200,
                Math.random() * 10 + 50,
                Math.random() * 400 - 200
            );
            
            scene.add(cloudGroup);
        }
        
        console.log('云层创建成功');
    }
    
    // 创建远景山脉
    function createMountains() {
        // 使用多层山脉创建深度感
        createMountainRange(1200, 150, -400, 0x3F609E, 0x6583A8); // 最远的山脉层 - 深蓝色
        createMountainRange(1000, 100, -300, 0x4B6E99, 0x7A94B5); // 中层山脉 - 中蓝色
        createMountainRange(800, 80, -200, 0x5C7097, 0x8BA3BE);   // 近层山脉 - 浅蓝色
        
        console.log('远景山脉创建成功');
    }
    
    // 创建单层山脉
    function createMountainRange(width, height, distance, peakColor, baseColor) {
        // 使用细分程度更高的几何体创建更详细的山脉
        const mountainGeometry = new THREE.PlaneGeometry(width, height, 150, 40);
        const mountainPositions = mountainGeometry.attributes.position.array;
        
        // 生成山脉形状 - 使用更复杂的噪声算法
        for (let i = 0; i < mountainPositions.length; i += 3) {
            // 只修改y值来创建山峰高度
            if (i % 3 === 1) { // y值
                const xIndex = Math.floor(i / 3) % (150 + 1);
                const zIndex = Math.floor(Math.floor(i / 3) / (150 + 1));
                
                // 将索引归一化到0-1范围
                const nx = xIndex / 150;
                const nz = zIndex / 40;
                
                // 使用多个频率的正弦函数创建自然的山峰
                let heightValue = 0;
                
                // 大型山峰 - 低频
                heightValue += Math.sin(nx * Math.PI * 2) * 15;
                heightValue += Math.sin((nx + 0.5) * Math.PI * 1.5) * 12;
                
                // 中型山峰 - 中频
                heightValue += Math.sin(nx * Math.PI * 6 + 0.5) * 8 * (0.5 + 0.5 * Math.sin(nz * Math.PI));
                heightValue += Math.sin(nx * Math.PI * 8 + 1.5) * 6 * (0.7 + 0.3 * Math.cos(nz * Math.PI * 2));
                
                // 小型细节 - 高频
                heightValue += Math.sin(nx * Math.PI * 15) * 3 * (0.8 + 0.2 * Math.sin(nz * Math.PI * 3));
                
                // 添加基础高度和随机变化
                heightValue = Math.max(0, heightValue + height * 0.3);
                
                // 从中心向两边逐渐降低高度，形成自然的山脉轮廓
                const falloff = 1 - Math.pow(Math.abs(nx - 0.5) * 2, 2);
                heightValue *= falloff;
                
                mountainPositions[i] = heightValue;
            }
        }
        
        // 更新几何体顶点法线
        mountainGeometry.computeVertexNormals();
        
        // 创建山脉材质 - 使用更丰富的渐变和细节
        const mountainCanvas = document.createElement('canvas');
        mountainCanvas.width = 512;
        mountainCanvas.height = 512;
        const ctx = mountainCanvas.getContext('2d');
        
        // 创建垂直渐变 - 从山顶到山脚
        const gradient = ctx.createLinearGradient(0, 0, 0, 512);
        gradient.addColorStop(0, `#${peakColor.toString(16).padStart(6, '0')}`);       // 山顶颜色
        gradient.addColorStop(0.4, `#${baseColor.toString(16).padStart(6, '0')}`);     // 山腰颜色
        gradient.addColorStop(0.7, `#${(baseColor + 0x101010).toString(16).padStart(6, '0')}`); // 山脚颜色
        gradient.addColorStop(1, `#${(baseColor + 0x202020).toString(16).padStart(6, '0')}`);   // 底部颜色
        
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 512, 512);
        
        // 添加一些噪点来增加纹理细节
        ctx.globalAlpha = 0.1;
        for (let i = 0; i < 5000; i++) {
            const x = Math.random() * 512;
            const y = Math.random() * 512;
            const size = Math.random() * 2 + 1;
            ctx.fillStyle = Math.random() > 0.5 ? '#ffffff' : '#000000';
            ctx.fillRect(x, y, size, size);
        }
        
        ctx.globalAlpha = 1.0;
        
        // 添加一些水平纹理线模拟岩层
        ctx.globalAlpha = 0.05;
        for (let i = 0; i < 30; i++) {
            const y = Math.random() * 512;
            const width = Math.random() * 200 + 100;
            ctx.strokeStyle = '#000000';
            ctx.lineWidth = Math.random() * 2 + 0.5;
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(width, y);
            ctx.stroke();
        }
        
        // 创建纹理和材质
        const mountainTexture = new THREE.CanvasTexture(mountainCanvas);
        mountainTexture.wrapS = THREE.RepeatWrapping;
        mountainTexture.wrapT = THREE.RepeatWrapping;
        mountainTexture.repeat.set(4, 1);
        
        const mountainMaterial = new THREE.MeshPhongMaterial({
            map: mountainTexture,
            side: THREE.DoubleSide,
            shininess: 0,
            specular: 0x000000,
            bumpMap: mountainTexture,
            bumpScale: 5,
            displacementMap: mountainTexture,
            displacementScale: 5
        });
        
        // 创建山脉网格
        const mountains = new THREE.Mesh(mountainGeometry, mountainMaterial);
        mountains.rotation.x = -Math.PI / 2;
        mountains.position.set(0, -20, distance);
        mountains.receiveShadow = true;
        scene.add(mountains);
        
        return mountains;
    }
    
    // 添加装饰性岩石
    function addRocks() {
        // 创建一些随机分布的岩石
        const rockGeometry = new THREE.DodecahedronGeometry(1, 0);
        const rockMaterial = new THREE.MeshStandardMaterial({
            color: 0x888888,
            roughness: 0.9,
            metalness: 0.1
        });
        
        // 添加7-10个岩石
        const rockCount = Math.floor(Math.random() * 4) + 7;
        
        for(let i=0; i<rockCount; i++) {
            const rockMesh = new THREE.Mesh(rockGeometry, rockMaterial);
            
            // 随机尺寸
            const scale = Math.random() * 0.5 + 0.5;
            rockMesh.scale.set(scale, scale * 0.8, scale);
            
            // 随机旋转
            rockMesh.rotation.set(
                Math.random() * Math.PI,
                Math.random() * Math.PI,
                Math.random() * Math.PI
            );
            
            // 随机位置 - 在战斗区域外围
            const angle = Math.random() * Math.PI * 2;
            const distance = Math.random() * 5 + 12; // 12-17的距离
            
            rockMesh.position.set(
                Math.cos(angle) * distance,
                -1 + (scale * 0.4) - 0.3, // 根据石头大小调整y坐标，使其半嵌入地面
                Math.sin(angle) * distance
            );
            
            rockMesh.castShadow = true;
            rockMesh.receiveShadow = true;
            
            scene.add(rockMesh);
        }
        
        // 添加一些更大的石头在远处
        const bigRockCount = Math.floor(Math.random() * 3) + 5;
        
        for(let i=0; i<bigRockCount; i++) {
            // 使用更复杂的几何体作为大石头
            const rockGeometry = new THREE.DodecahedronGeometry(1, 1); // 更高的细分级别
            const rockMesh = new THREE.Mesh(rockGeometry, rockMaterial);
            
            // 这些石头更大
            const scale = Math.random() * 1.5 + 1.2; // 1.2-2.7的大小
            rockMesh.scale.set(scale, scale * 0.7, scale);
            
            // 随机旋转，增加自然感
            rockMesh.rotation.set(
                Math.random() * Math.PI,
                Math.random() * Math.PI,
                Math.random() * Math.PI
            );
            
            // 随机位置 - 在更远的距离
            const angle = Math.random() * Math.PI * 2;
            const distance = Math.random() * 15 + 25; // 25-40的距离
            
            rockMesh.position.set(
                Math.cos(angle) * distance,
                -1.05 + (scale * 0.35) - 0.4, // 大石头也半嵌入地面，但要考虑到地面高度是-1.05
                Math.sin(angle) * distance
            );
            
            rockMesh.castShadow = true;
            rockMesh.receiveShadow = true;
            
            scene.add(rockMesh);
        }
        
        // 添加一些岩石组合形成的小山 - 作为风景特征
        const rockFormationCount = Math.floor(Math.random() * 2) + 2; // 2-3个岩石组合
        
        for(let i=0; i<rockFormationCount; i++) {
            const rockFormation = new THREE.Group();
            
            // 确定岩石组的位置
            const angle = Math.random() * Math.PI * 2;
            const distance = Math.random() * 10 + 30; // 30-40的距离
            const posX = Math.cos(angle) * distance;
            const posZ = Math.sin(angle) * distance;
            
            // 每个组合包含4-7个岩石
            const stoneCount = Math.floor(Math.random() * 4) + 4;
            
            for(let j=0; j<stoneCount; j++) {
                // 使用不同大小和形状的石头
                let stoneGeometry;
                if(Math.random() > 0.3) {
                    stoneGeometry = new THREE.DodecahedronGeometry(1, 0);
                } else {
                    stoneGeometry = new THREE.TetrahedronGeometry(1, 0);
                }
                
                const stoneMesh = new THREE.Mesh(stoneGeometry, rockMaterial);
                
                // 石头大小变化很大
                const scale = Math.random() * 1.8 + 0.7;
                stoneMesh.scale.set(scale, scale * (0.7 + Math.random() * 0.4), scale);
                
                // 随机旋转
                stoneMesh.rotation.set(
                    Math.random() * Math.PI,
                    Math.random() * Math.PI,
                    Math.random() * Math.PI
                );
                
                // 在组合中的相对位置 - 石头紧密堆叠
                const localRadius = Math.random() * 2;
                const localAngle = Math.random() * Math.PI * 2;
                
                // 一些石头在底部，一些在顶部
                const heightVariation = j < 2 ? 0 : Math.random() * 1.5;
                
                stoneMesh.position.set(
                    Math.cos(localAngle) * localRadius,
                    heightVariation - 0.4, // 较低的石头部分埋入地面
                    Math.sin(localAngle) * localRadius
                );
                
                stoneMesh.castShadow = true;
                stoneMesh.receiveShadow = true;
                
                rockFormation.add(stoneMesh);
            }
            
            // 设置整个岩石组的位置
            rockFormation.position.set(posX, -1.05, posZ);
            
            scene.add(rockFormation);
        }
        
        console.log('装饰性岩石添加成功');
    }

    function loadPlayerModel(callback) {
        try {
            const playerModelPath = '/static/models/player.glb';
            console.log('正在加载玩家模型:', playerModelPath);
            
            // 尝试使用相对路径加载
            loader.load(playerModelPath, function (gltf) {
                if (!scene) {
                    console.error('场景已被销毁');
                    return callback(new Error('场景已被销毁'));
                }
                
                playerModel = gltf.scene;
                playerModel.position.set(-1.5, 0, 0); // 调整玩家位置，拉开距离
                playerModel.rotation.y = Math.PI / 2;
                playerModel.scale.set(0.8, 0.8, 0.8); // 放大模型尺寸，从0.5增加到0.8
                playerModel.traverse(function (child) {
                    if (child.isMesh) {
                        child.castShadow = true;
                    }
                });
                scene.add(playerModel);

                playerMixer = new THREE.AnimationMixer(playerModel);
                gltf.animations.forEach((clip) => {
                    console.log('Player animation clip name:', clip.name);
                    playerActions[clip.name] = playerMixer.clipAction(clip);
                });
                console.log('玩家模型加载成功，动画列表:', Object.keys(playerActions));
                
                // 播放待机动画
                playIdleAnimation(playerMixer, playerActions);
                
                callback(null);
            }, 
            function (xhr) {
                console.log('玩家模型加载进度:', (xhr.loaded / xhr.total * 100) + '%');
            },
            function (error) {
                console.error('加载玩家模型时出错:', error);
                callback(error);
            });
        } catch (e) {
            console.error('加载玩家模型过程中发生异常:', e);
            callback(e);
        }
    }

    function loadEnemyModel(callback) {
        try {
            const enemyModelPath = '/static/models/enemy.glb';
            console.log('正在加载敌人模型:', enemyModelPath);
            
            // 尝试使用相对路径加载
            loader.load(enemyModelPath, function (gltf) {
                if (!scene) {
                    console.error('场景已被销毁');
                    return callback(new Error('场景已被销毁'));
                }
                
                enemyModel = gltf.scene;
                enemyModel.position.set(1.5, 0, 0); // 调整敌人位置，拉开距离
                enemyModel.rotation.y = -Math.PI / 2;
                enemyModel.scale.set(0.8, 0.8, 0.8); // 放大模型尺寸，从0.5增加到0.8
                enemyModel.traverse(function (child) {
                    if (child.isMesh) {
                        child.castShadow = true;
                    }
                });
                scene.add(enemyModel);

                enemyMixer = new THREE.AnimationMixer(enemyModel);
                gltf.animations.forEach((clip) => {
                    console.log('Enemy animation clip name:', clip.name);
                    enemyActions[clip.name] = enemyMixer.clipAction(clip);
                });
                console.log('敌人模型加载成功，动画列表:', Object.keys(enemyActions));
                
                // 播放待机动画
                playIdleAnimation(enemyMixer, enemyActions);
                
                callback(null);
            }, 
            function (xhr) {
                console.log('敌人模型加载进度:', (xhr.loaded / xhr.total * 100) + '%');
            },
            function (error) {
                console.error('加载敌人模型时出错:', error);
                callback(error);
            });
        } catch (e) {
            console.error('加载敌人模型过程中发生异常:', e);
            callback(e);
        }
    }

    // 顺序加载所有模型 - 先加载天空盒
    loadSkyBox(function(skyErr) {
        if (skyErr) {
            console.error('加载天空盒失败:', skyErr);
            showBattleLog('加载场景失败，请重试');
            exitBattleButton.style.display = 'block';
            return;
        }
        
        console.log('开始加载玩家模型...');
        loadPlayerModel(function(playerErr) {
            if (playerErr) {
                console.error('加载玩家模型失败:', playerErr);
                showBattleLog('加载玩家模型失败，请重试');
                exitBattleButton.style.display = 'block';
                return;
            }
            
            console.log('开始加载敌人模型...');
            loadEnemyModel(function(enemyErr) {
                if (enemyErr) {
                    console.error('加载敌人模型失败:', enemyErr);
                    showBattleLog('加载敌人模型失败，请重试');
                    exitBattleButton.style.display = 'block';
                    return;
                }
                
                // 所有模型加载完成
                console.log('所有模型加载完成，玩家模型:', playerModel, '敌人模型:', enemyModel);
                createHealthBars(); // 创建2D血条

                // 使用修改后的animate函数
                animationId = requestAnimationFrame(animate);
            });
        });
    });
}
// 创建2D血条UI
function createHealthBars() {
    const container = document.getElementById('battle-container');
    
    // 彻底清除所有现有血条
    const healthBars = container.querySelectorAll('[id$="-health-container"], [id$="-health-bar"]');
    healthBars.forEach(bar => {
        if (bar && bar.parentNode) {
            bar.parentNode.removeChild(bar);
        }
    });
    
    console.log('创建血条UI');
    
    // 玩家血条 - 左上角
    const playerHealthContainer = document.createElement('div');
    playerHealthContainer.id = 'player-health-container';
    playerHealthContainer.style.position = 'absolute';
    playerHealthContainer.style.top = '5%';
    playerHealthContainer.style.left = '5%';
    playerHealthContainer.style.width = '30%';
    playerHealthContainer.style.height = '2%';
    playerHealthContainer.style.backgroundColor = '#333';
    playerHealthContainer.style.borderRadius = '10px';
    playerHealthContainer.style.overflow = 'hidden';
    playerHealthContainer.style.zIndex = '1000';
    playerHealthContainer.style.minWidth = '100px'; // 最小宽度
    playerHealthContainer.style.minHeight = '10px'; // 最小高度
    playerHealthContainer.style.transition = 'all 0.3s ease'; // 添加过渡效果
    
    const playerHealthBar = document.createElement('div');
    playerHealthBar.id = 'player-health-bar';
    playerHealthBar.style.height = '100%';
    playerHealthBar.style.width = '100%';
    playerHealthBar.style.backgroundColor = '#00ff00';
    playerHealthBar.style.transition = 'width 0.3s, background-color 0.3s';
    
    playerHealthContainer.appendChild(playerHealthBar);
    container.appendChild(playerHealthContainer);
    
    // 敌人血条 - 右上角
    const enemyHealthContainer = document.createElement('div');
    enemyHealthContainer.id = 'enemy-health-container';
    enemyHealthContainer.style.position = 'absolute';
    enemyHealthContainer.style.top = '5%';
    enemyHealthContainer.style.right = '5%';
    enemyHealthContainer.style.width = '30%';
    enemyHealthContainer.style.height = '2%';
    enemyHealthContainer.style.backgroundColor = '#333';
    enemyHealthContainer.style.borderRadius = '10px';
    enemyHealthContainer.style.overflow = 'hidden';
    enemyHealthContainer.style.zIndex = '1000';
    enemyHealthContainer.style.minWidth = '100px'; // 最小宽度
    enemyHealthContainer.style.minHeight = '10px'; // 最小高度
    enemyHealthContainer.style.transition = 'all 0.3s ease'; // 添加过渡效果
    
    const enemyHealthBar = document.createElement('div');
    enemyHealthBar.id = 'enemy-health-bar';
    enemyHealthBar.style.height = '100%';
    enemyHealthBar.style.width = '100%';
    enemyHealthBar.style.backgroundColor = '#00ff00';
    enemyHealthBar.style.transition = 'width 0.3s, background-color 0.3s';
    
    enemyHealthContainer.appendChild(enemyHealthBar);
    container.appendChild(enemyHealthContainer);

    // 战斗日志样式增强 - 移到左下角
    const battleLog = document.getElementById('battle-log');
    if (battleLog) {
        battleLog.style.position = 'absolute';
        battleLog.style.bottom = '5%';   // 改为底部5%位置
        battleLog.style.left = '5%';     // 改为左侧5%位置
        battleLog.style.color = 'white';
        battleLog.style.fontFamily = 'Arial, sans-serif';
        battleLog.style.fontSize = '16px';
        battleLog.style.maxWidth = '35%';
        battleLog.style.maxHeight = '25%';
        battleLog.style.overflowY = 'auto';
        battleLog.style.backgroundColor = 'rgba(0, 0, 0, 0.6)'; // 增加不透明度
        battleLog.style.padding = '10px';
        battleLog.style.borderRadius = '5px';
        battleLog.style.zIndex = '1000';
        battleLog.style.transition = 'all 0.3s ease';
        battleLog.style.textShadow = '1px 1px 2px rgba(0,0,0,0.8)'; // 添加文字阴影
    }

    console.log('血条UI创建完成，玩家血条：', playerHealthBar, '敌人血条：', enemyHealthBar);
    
    // 应用响应式布局
    updateBattleUIPositions();
}

// 更新血条
function updateHealthBar(isPlayer, currentHP, maxHP) {
    const percentage = Math.max(0, Math.min(100, (currentHP / maxHP) * 100));
    const healthBarId = isPlayer ? 'player-health-bar' : 'enemy-health-bar';
    const healthBar = document.getElementById(healthBarId);
    
    console.log(`更新${isPlayer ? '玩家' : '敌人'}血条: ${currentHP}/${maxHP}, 百分比: ${percentage}%`);
    
    if (healthBar) {
        // 设置剩余血量的宽度
        healthBar.style.width = `${percentage}%`;
        
        // 根据血量百分比设置颜色
        if (percentage <= 30) {
            // 低血量时显示红色
            healthBar.style.backgroundColor = '#ff0000';
        } else if (percentage <= 60) {
            // 中等血量时显示黄色
            healthBar.style.backgroundColor = '#ffff00';
        } else {
            // 高血量时显示绿色
            healthBar.style.backgroundColor = '#00ff00';
        }
    } else {
        console.error(`找不到${healthBarId}元素`);
    }
}

// 显示战斗日志
function showBattleLog(log) {
    battleLogElement.innerHTML += `<p>${log}</p>`;
}

// 撞击特效
function impactEffect(attacker, target) {
    const originalPosition = attacker.position.clone();
    const targetPosition = target.position.clone();
    const direction = new THREE.Vector3().subVectors(targetPosition, originalPosition).normalize();
    const distance = originalPosition.distanceTo(targetPosition);
    const impactDistance = 0.5;
    const impactDuration = 0.2;
    const startTime = performance.now();

    function animateImpact() {
        const elapsedTime = (performance.now() - startTime) / 1000;
        if (elapsedTime < impactDuration) {
            const progress = elapsedTime / impactDuration;
            const newPosition = originalPosition.clone().addScaledVector(direction, progress * impactDistance);
            attacker.position.copy(newPosition);
            requestAnimationFrame(animateImpact);
        } else {
            attacker.position.copy(originalPosition);
        }
    }

    requestAnimationFrame(animateImpact);
}

// 播放攻击动画
function playAttackAnimation(mixer, actions) {
    // 尝试匹配常见的攻击动画名称
    const attackNames = ['Attack', 'attack', 'Attack1', 'attack1', 'swing', 'hit'];
    
    // 保存当前正在播放的待机动画（如有）
    let currentIdleAction = null;
    for (const key in actions) {
        if (actions[key].isRunning()) {
            currentIdleAction = actions[key];
            // 暂时停止待机动画
            currentIdleAction.stop();
            break;
        }
    }
    
    for (const name of attackNames) {
        if (actions[name]) {
            // 创建一次性动画
            const attackAction = actions[name];
            attackAction.setLoop(THREE.LoopOnce);
            attackAction.reset();
            
            // 添加动画完成事件
            const finishCallback = function() {
                mixer.removeEventListener('finished', finishCallback);
                
                // 攻击动画结束后恢复待机动画
                if (currentIdleAction) {
                    currentIdleAction.reset().play();
                } else {
                    playIdleAnimation(mixer, actions);
                }
            };
            
            mixer.addEventListener('finished', finishCallback);
            attackAction.play();
            return true;
        }
    }
    
    console.warn('未找到攻击动画');
    
    // 如果没有攻击动画，恢复待机动画
    if (currentIdleAction) {
        currentIdleAction.reset().play();
    } else {
        playIdleAnimation(mixer, actions);
    }
    
    return false;
}

// 开始对战
window.startBattle = function startBattle(player, enemy) {
    console.log('开始战斗！玩家数据:', player, '敌人数据:', enemy);
    
    // 将战斗参数保存为全局变量，以便所有函数都能访问
    window.battlePlayer = player;
    window.battleEnemy = enemy;
    
    // 确保enemy.type被保存并输出到控制台，方便调试
    console.log('敌人类型:', enemy.type);
    
    // 添加战斗状态
    player.isDefending = false; // 是否处于防御状态
    enemy.isDefending = false;  // 是否处于防御状态
    
    // 设置最大生命值 - 使用全局玩家最大生命值
    player.maxHP = playerMaxHP; // 使用正确的玩家最大血量而不是当前血量
    enemy.maxHP = enemy.hp;     // 敌人的血量仍然是满的
    
    // 清空现有模型引用，以便重新加载
    playerModel = null;
    enemyModel = null;
    playerActions = {};
    enemyActions = {};
    
    // 初始化战斗场景
    initBattleScene();
    createHealthBars(); // 创建2D血条
    
    // 根据速度显示谁先行动的信息，并包含敌人类型信息
    let enemyTypeText = "";
    switch(enemy.type) {
        case 0: enemyTypeText = "平衡型"; break;
        case 1: enemyTypeText = "高攻击型"; break;
        case 2: enemyTypeText = "高防御型"; break;
        case 3: enemyTypeText = "高速度型"; break;
        default: enemyTypeText = "未知类型";
    }
    
    if (player.speed >= enemy.speed) {
        showBattleLog(`你遭遇了${enemyTypeText}怪物！由于你的速度更快，你先行动。敌人生命值: ${enemy.hp}，防御: ${enemy.defense}，速度: ${enemy.speed}`);
    } else {
        showBattleLog(`你遭遇了${enemyTypeText}怪物！敌人速度更快，敌人先行动。敌人生命值: ${enemy.hp}，防御: ${enemy.defense}，速度: ${enemy.speed}`);
    }
    
    // 确保设置敌人和玩家的初始最大血量
    console.log('设置初始血条 - 玩家:', player.hp, '/', player.maxHP, '敌人:', enemy.hp, '/', enemy.maxHP);
    updateHealthBar(true, player.hp, player.maxHP); // 更新玩家血条
    updateHealthBar(false, enemy.hp, enemy.maxHP); // 更新敌人血条
    
    // 初始化回合状态
    isPlayerTurn = player.speed >= enemy.speed;
    isActionInProgress = false;
    
    // 创建战斗按钮
    createBattleButtons();
    // 根据回合状态设置按钮
    setBattleButtonsEnabled(isPlayerTurn);
    
    // 添加等待模型加载完成的检查
    function checkModelsLoaded() {
        console.log('检查模型加载状态:', {
            playerModelLoaded: playerModel ? true : false, 
            enemyModelLoaded: enemyModel ? true : false
        });
        
        if (playerModel && enemyModel) {
            console.log('模型加载完成，开始战斗回合');
            // 模型加载完成，启用按钮
            setBattleButtonsEnabled(true);
            
            // 如果敌人速度更快，他先行动
            if (enemy.speed > player.speed) {
                showBattleLog('敌人速度更快，先行动！');
                setBattleButtonsEnabled(false);
                setTimeout(executeEnemyTurn, 1500);
            } else {
                showBattleLog('请选择你的行动！');
            }
        } else {
            console.log('模型尚未加载完成，等待中...');
            // 继续等待模型加载
            setTimeout(checkModelsLoaded, 500);
        }
    }
    
    // 在场景初始化完成后开始检查模型
    setTimeout(checkModelsLoaded, 1000);

    // 玩家行动执行函数
    function executePlayerTurn(actionType) {
        // 使用全局战斗数据
        const player = window.battlePlayer;
        const enemy = window.battleEnemy;
        
        console.log(`执行玩家行动: ${actionType}`);
        
        if (!playerModel || !enemyModel) {
            console.error('模型未加载, playerModel:', playerModel, 'enemyModel:', enemyModel);
            showBattleLog('战斗系统错误，请重试！');
            // 重置状态
            isActionInProgress = false;
            isPlayerTurn = true;
            setBattleButtonsEnabled(true);
            return;
        }
        
        // 重置防御状态
        player.isDefending = false;

        // 确保动画混合器存在
        if (!playerMixer) {
            console.log('创建玩家动画混合器');
            playerMixer = new THREE.AnimationMixer(playerModel);
        }

        // 基于动作类型执行不同的行为
        switch (actionType) {
            case 'attack':
                // 播放攻击动画
                let hasAnimation = false;
                if (playerActions['Attack'] || playerActions['attack']) {
                    const action = playerActions['Attack'] || playerActions['attack'];
                    action.reset().play();
                    hasAnimation = true;
                    console.log('播放玩家攻击动画:', hasAnimation ? '成功' : '失败');
                } else {
                    console.warn('未找到玩家攻击动画，可用动画:', Object.keys(playerActions));
                }
                
                // 播放攻击音效
                const fireSound = document.getElementById('fire-sound');
                if (fireSound) {
                    fireSound.currentTime = 0;
                    fireSound.play();
                }
                
                // 创建火焰特效
                createFireEffect(playerModel, enemyModel);

                // 撞击效果
                impactEffect(playerModel, enemyModel);
                
                // 延迟一小段时间后显示命中特效
                setTimeout(() => {
                    // 创建命中爆炸特效
                    createHitExplosion(enemyModel);
                }, 300);
                
                // 伤害计算
                setTimeout(() => {
                    console.log('执行玩家攻击伤害计算');
                    
                    // 基础伤害
                    let damage = player.attack;
                    
                    // 考虑敌人防御，减少伤害
                    const defenseReduction = enemy.defense / (enemy.defense + 40); // 防御效果计算公式
                    damage = Math.max(1, Math.floor(damage * (1 - defenseReduction))); // 确保至少造成1点伤害
                    
                    // 如果敌人正在防御，伤害减半
                    if (enemy.isDefending) {
                        damage = Math.floor(damage / 2);
                        showBattleLog(`敌人处于防御状态，伤害减半！`);
                    }
                    
                    const oldHP = enemy.hp;
                    enemy.hp = Math.max(0, enemy.hp - damage);
                    
                    console.log(`玩家攻击敌人，造成 ${damage} 点伤害，敌人防御减免了 ${Math.floor(defenseReduction * 100)}% 的伤害，敌人剩余生命值: ${enemy.hp}/${oldHP}`);
                    showBattleLog(`你攻击了敌人，敌人防御减免了 ${Math.floor(defenseReduction * 100)}% 的伤害，最终造成 ${damage} 点伤害，敌人剩余生命值: ${enemy.hp}`);
                    updateHealthBar(false, enemy.hp, enemy.maxHP);
                    
                    // 创建敌人流血特效
                    createBloodEffect(enemyModel);

                    if (enemy.hp <= 0) {
                        showBattleLog('你战胜了敌人！');
                        endBattle(true);
                    } else {
                        // 敌人回合
                        setTimeout(executeEnemyTurn, 1000);
                    }
                }, hasAnimation ? 800 : 500);
                break;
                
            case 'defend':
                // 设置防御状态
                player.isDefending = true;
                showBattleLog('你进入了防御姿态，防御力提升！');
                
                // 播放防御音效
                const defenseSound = document.getElementById('defense-sound');
                if (defenseSound) {
                    defenseSound.currentTime = 0;
                    defenseSound.play();
                }
                
                // 创建防御特效并获取持续时间
                const shieldDuration = createShieldEffect(playerModel);
                
                // 播放防御动画（如果有）
                if (playerActions['Defend'] || playerActions['defend']) {
                    const action = playerActions['Defend'] || playerActions['defend'];
                    action.reset().play();
                } else if (playerActions['Idle']) {
                    // 如果没有专门的防御动画，使用待机动画
                    playerActions['Idle'].reset().play();
                }
                
                // 敌人回合
                setTimeout(executeEnemyTurn, Math.max(1000, shieldDuration * 1000));
                break;
                
            case 'heal':
                // 检查是否可以回复（血量低于最大值的70%）
                if (player.hp < player.maxHP * 0.7) {
                    const healAmount = Math.floor(player.maxHP * 0.3); // 回复30%血量
                    player.hp = Math.min(player.hp + healAmount, player.maxHP);
                    
                    // 播放恢复音效
                    const recoverSound = document.getElementById('recover-sound');
                    if (recoverSound) {
                        recoverSound.currentTime = 0;
                        recoverSound.play();
                    }
                    
                    // 更新血条
                    updateHealthBar(true, player.hp, player.maxHP);
                    showBattleLog(`你恢复了${healAmount}点生命值！`);
                    
                    // 创建治疗特效并获取持续时间
                    const healDuration = createHealEffect(playerModel);
                    
                    // 播放治疗动画（如果有）
                    if (playerActions['Heal'] || playerActions['heal']) {
                        const action = playerActions['Heal'] || playerActions['heal'];
                        action.reset().play();
                    } else if (playerActions['Idle']) {
                        // 如果没有专门的治疗动画，使用待机动画
                        playerActions['Idle'].reset().play();
                    }
                    
                    // 敌人回合
                    setTimeout(() => {
                        setTimeout(executeEnemyTurn, 500);
                    }, healDuration * 1000);
                } else {
                    showBattleLog('你的生命值较高，无需恢复！');
                    setBattleButtonsEnabled(true); // 重新启用按钮，让玩家可以选择其他动作
                    return; // 不执行行动，不切换到敌人回合
                }
                
                break;
                
            case 'retreat':
                // 这部分逻辑已经移到handleRetreatAction中处理
                // 直接调用handleRetreatAction函数
                handleRetreatAction();
                break;
        }
        
        // 在回合结束时重置状态
        isActionInProgress = false;
        isPlayerTurn = false;
    }
    
    // 敌人AI行动
    function executeEnemyTurn() {
        // 使用全局战斗数据
        const player = window.battlePlayer;
        const enemy = window.battleEnemy;
        
        console.log('敌人回合开始');
        
        if (!enemyModel) {
            console.error('敌人模型未加载，无法进行攻击');
            showBattleLog('战斗系统错误，敌人无法攻击');
            setBattleButtonsEnabled(true);
            return;
        }
        
        // 重置敌人防御状态
        enemy.isDefending = false;
        
        // 确保敌人模型可见
        enemyModel.visible = true;
        
        if (!enemyMixer) {
            console.log('创建敌人动画混合器');
            enemyMixer = new THREE.AnimationMixer(enemyModel);
        }
        
        // 敌人AI决策
        let enemyAction = 'attack';
        
        // 根据生命值百分比和速度决定行动
        const enemyHpPercent = enemy.hp / enemy.maxHP;
        const speedDiff = enemy.speed - player.speed;
        
        // 低血量优先级：治疗 > 防御 > 攻击
        if (enemyHpPercent < 0.3) {
            if (Math.random() < 0.6) { // 60%几率选择恢复
                enemyAction = 'heal';
            } else if (Math.random() < 0.5) { // 已经不治疗的情况下，50%几率选择防御
                enemyAction = 'defend';
            }
        } 
        // 中等血量：根据速度差异选择策略
        else if (enemyHpPercent < 0.6) {
            if (speedDiff < -5) {
                // 速度劣势，更倾向于防御
                if (Math.random() < 0.4) {
                    enemyAction = 'defend';
                } else if (Math.random() < 0.3) {
                    enemyAction = 'heal';
                }
            } else {
                // 速度优势或相当，偏向攻击
                if (Math.random() < 0.2) {
                    enemyAction = 'heal';
                } else if (Math.random() < 0.15) {
                    enemyAction = 'defend';
                }
            }
        }
        // 高血量：主要攻击，偶尔防御
        else {
            if (Math.random() < 0.1 + (speedDiff < -10 ? 0.1 : 0)) { // 速度明显劣势时略微增加防御几率
                enemyAction = 'defend';
            }
        }
        
        console.log(`敌人选择行动: ${enemyAction}`);
        
        // 执行敌人行动
        switch (enemyAction) {
            case 'attack':
                // 播放攻击动画
                let hasAnimation = false;
                
                // 尝试播放不同命名的攻击动画
                if (enemyActions['Attack'] || enemyActions['attack']) {
                    console.log('播放敌人攻击动画');
                    const attackAction = enemyActions['Attack'] || enemyActions['attack'];
                    attackAction.reset().setLoop(THREE.LoopOnce, 1).play();
                    hasAnimation = true;
                } else {
                    console.warn('未找到敌人攻击动画，可用动画:', Object.keys(enemyActions));
                }
                
                // 播放攻击音效
                const fireSound = document.getElementById('fire-sound');
                if (fireSound) {
                    fireSound.currentTime = 0;
                    fireSound.play();
                }
                
                // 创建敌人的蓝色火焰攻击
                createEnemyFireEffect(enemyModel, playerModel);
                
                // 撞击效果
                impactEffect(enemyModel, playerModel);
                
                // 延迟一小段时间后显示命中特效
                setTimeout(() => {
                    createHitExplosion(playerModel);
                }, 300);
                
                // 伤害计算
                setTimeout(() => {
                    // 基础伤害
                    let damage = enemy.attack;
                    
                    // 考虑玩家防御，减少伤害
                    const defenseReduction = player.defense / (player.defense + 40); // 防御效果计算公式
                    damage = Math.max(1, Math.floor(damage * (1 - defenseReduction))); // 确保至少造成1点伤害
                    
                    // 如果玩家正在防御，伤害减半
                    if (player.isDefending) {
                        damage = Math.floor(damage / 2);
                        showBattleLog(`你处于防御状态，伤害减半！`);
                    }
                    
                    const oldHP = player.hp;
                    player.hp = Math.max(0, player.hp - damage);
                    
                    console.log(`敌人攻击玩家，造成 ${damage} 点伤害，玩家防御减免了 ${Math.floor(defenseReduction * 100)}% 的伤害，玩家剩余生命值: ${player.hp}/${oldHP}`);
                    showBattleLog(`敌人攻击了你，你的防御减免了 ${Math.floor(defenseReduction * 100)}% 的伤害，最终受到 ${damage} 点伤害，你剩余生命值: ${player.hp}`);
                    updateHealthBar(true, player.hp, player.maxHP);
                    
                    
                    // 创建玩家流血特效
                    createBloodEffect(playerModel);

                    if (player.hp <= 0) {
                        showBattleLog('你被敌人击败了！');
                        endBattle(false);
                    } else {
                        // 玩家回合 - 重新启用按钮
                        setTimeout(() => {
                            console.log("敌方回合结束，开始玩家回合");
                            showBattleLog('轮到你行动了！');
                            isPlayerTurn = true;
                            isActionInProgress = false;
                            setBattleButtonsEnabled(true);
                        }, 1000);
                    }
                }, hasAnimation ? 800 : 500);
                break;
                
            case 'defend':
                showBattleLog('敌人摆出了防御姿态！');
                enemy.isDefending = true;
                
                // 播放防御音效
                const defenseSound = document.getElementById('defense-sound');
                if (defenseSound) {
                    defenseSound.currentTime = 0;
                    defenseSound.play();
                }
                
                // 播放防御动画（如有）
                if (enemyActions['Defend'] || enemyActions['defend']) {
                    const action = enemyActions['Defend'] || enemyActions['defend'];
                    action.reset().play();
                } else if (enemyActions['Idle'] || enemyActions['idle']) {
                    const action = enemyActions['Idle'] || enemyActions['idle'];
                    action.reset().play();
                }
                
                // 创建防御特效
                createShieldEffect(enemyModel);
                
                // 返回玩家回合
                setTimeout(() => {
                    console.log("敌方选择防御，开始玩家回合");
                    showBattleLog('轮到你行动了！');
                    isPlayerTurn = true;
                    isActionInProgress = false;
                    setBattleButtonsEnabled(true);
                }, 1500);
                break;
                
            case 'heal':
                showBattleLog('敌人使用了恢复技能！');
                
                // 播放恢复音效
                const recoverSound = document.getElementById('recover-sound');
                if (recoverSound) {
                    recoverSound.currentTime = 0;
                    recoverSound.play();
                }
                
                // 播放治疗动画（如有）
                if (enemyActions['Cast'] || enemyActions['cast'] || enemyActions['Magic'] || enemyActions['magic']) {
                    const action = enemyActions['Cast'] || enemyActions['cast'] || 
                                  enemyActions['Magic'] || enemyActions['magic'];
                    action.reset().play();
                }
                
                // 创建恢复特效
                createHealEffect(enemyModel);
                
                // 恢复生命值
                setTimeout(() => {
                    const oldHP = enemy.hp;
                    const healAmount = Math.floor(enemy.maxHP * 0.3); // 恢复30%的最大生命值
                    enemy.hp = Math.min(enemy.maxHP, enemy.hp + healAmount);
                    
                    showBattleLog(`敌人恢复了 ${enemy.hp - oldHP} 点生命值！当前生命值: ${enemy.hp}`);
                    updateHealthBar(false, enemy.hp, enemy.maxHP);
                    
                    // 返回玩家回合
                    setTimeout(() => {
                        console.log("敌方选择治疗，开始玩家回合");
                        showBattleLog('轮到你行动了！');
                        isPlayerTurn = true;
                        isActionInProgress = false;
                        setBattleButtonsEnabled(true);
                    }, 500);
                }, 1000);
                break;
        }
    }
    
    function endBattle(isWin, isRetreat = false) {
        // 移除窗口大小变化监听
        window.removeEventListener('resize', handleWindowResize);
        
        // 禁用战斗按钮
        setBattleButtonsEnabled(false);
        
        // 停止战斗背景音乐
        const battleMusic = document.getElementById('battle-music');
        if (battleMusic) {
            battleMusic.pause();
            battleMusic.currentTime = 0;
        }
        
        // 每次战斗开始时玩家都是满血状态，不需要保存战斗结束时的血量
        
        // 显示结束信息
        if (isWin) {
            // 获得金币奖励 (基于怪物等级或属性计算)
            const enemy = window.battleEnemy;
            const coinReward = Math.floor(20 + enemy.level * 5 + Math.random() * 10);
            playerCoins += coinReward;
            
            showBattleLog(`战斗胜利！你获得了 ${coinReward} 金币。`);
            
            // 播放胜利音效
            const winSound = document.getElementById('win-sound');
            if (winSound && audioInitialized) {
                winSound.currentTime = 0;
                winSound.play().catch(error => {
                    console.log('胜利音效播放失败:', error);
                });
            }
            
            // 播放敌人被打败特效
            const effectDuration = createDefeatEffect(enemyModel);
            
            // 特效播放完毕后再显示退出按钮和停止动画
            setTimeout(() => {
        if (animationId) {
            cancelAnimationFrame(animationId);
            animationId = null;
        }
        if (controls) {
            controls.dispose(); // 释放控制器
            controls = null;
        }
        // 释放渲染器
        if (renderer) {
            renderer.dispose();
            renderer = null;
        }
        // 清空场景(仅在场景存在且模型加载完成时)
        if (scene && (playerModel || enemyModel)) {
            if (playerModel && scene.children.includes(playerModel)) {
                scene.remove(playerModel);
            }
            if (enemyModel && scene.children.includes(enemyModel)) {
                scene.remove(enemyModel);
            }
            scene = null;
        }
                
        // 显示退出战斗按钮
        exitBattleButton.style.display = 'block';
        // 先移除旧的点击事件监听器
        exitBattleButton.removeEventListener('click', exitBattleHandler);
                // 添加新的点击事件监听器
                exitBattleButton.addEventListener('click', exitBattleHandler);
            
            // 战斗结束后手动刷新怪物状态
            updateMonsterMarkers();
            
            // 继续执行其他退出战斗的代码...
        }, effectDuration * 1000);
        } else if (isRetreat) {
            // 撤退逻辑在handleRetreatAction中单独处理，这里不做任何处理
            // 避免重复处理导致冲突
            console.log("撤退处理由handleRetreatAction单独处理");
        } else {
            // 战斗失败惩罚
            const coinLoss = Math.floor(playerCoins * 0.2); // 损失20%的金币
            playerCoins = Math.max(0, playerCoins - coinLoss);
            
            // 临时降低属性
            tempStatReduction = {
                attack: Math.floor(playerAttack * 0.1), // 降低10%攻击力
                defense: Math.floor(playerDefense * 0.1), // 降低10%防御力
                speed: Math.floor(playerSpeed * 0.1) // 降低10%速度
            };
            
            // 应用临时属性降低
            playerAttack -= tempStatReduction.attack;
            playerDefense -= tempStatReduction.defense;
            playerSpeed -= tempStatReduction.speed;
            
            // 显示失败惩罚信息
            showBattleLog(`战斗失败！你损失了 ${coinLoss} 金币，属性暂时降低！`);
            alert(`战斗失败！\n损失了 ${coinLoss} 金币\n攻击力暂时降低 ${tempStatReduction.attack} 点\n防御力暂时降低 ${tempStatReduction.defense} 点\n速度暂时降低 ${tempStatReduction.speed} 点\n\n返回基地可以恢复属性！`);
            
            // 设置定时器，30秒后恢复属性
            setTimeout(() => {
                if (tempStatReduction.attack > 0 || tempStatReduction.defense > 0 || tempStatReduction.speed > 0) {
                    // 恢复属性
                    playerAttack += tempStatReduction.attack;
                    playerDefense += tempStatReduction.defense;
                    playerSpeed += tempStatReduction.speed;
                    
                    // 重置临时属性降低
                    tempStatReduction = {
                        attack: 0,
                        defense: 0,
                        speed: 0
                    };
                    
                    // 更新属性面板
                    updatePlayerStatsPanel();
                    
                    // 显示恢复信息
                    alert('你的属性已恢复！');
                }
            }, 30000); // 30秒后恢复
            
            showBattleLog('战斗失败！再接再厉。');
            
            // 播放失败音效
            const loseSound = document.getElementById('lose-sound');
            if (loseSound && audioInitialized) {
                loseSound.currentTime = 0;
                loseSound.play().catch(error => {
                    console.log('失败音效播放失败:', error);
                });
            }
            
            if (animationId) {
                cancelAnimationFrame(animationId);
                animationId = null;
            }
            if (controls) {
                controls.dispose(); // 释放控制器
                controls = null;
            }
            // 释放渲染器
            if (renderer) {
                renderer.dispose();
                renderer = null;
            }
            // 清空场景(仅在场景存在且模型加载完成时)
            if (scene && (playerModel || enemyModel)) {
                if (playerModel && scene.children.includes(playerModel)) {
                    scene.remove(playerModel);
                }
                if (enemyModel && scene.children.includes(enemyModel)) {
                    scene.remove(enemyModel);
                }
                scene = null;
            }
            
            // 显示退出战斗按钮
            exitBattleButton.style.display = 'block';
            // 先移除旧的点击事件监听器
            exitBattleButton.removeEventListener('click', exitBattleHandler);
            // 添加新的点击事件监听器
            exitBattleButton.addEventListener('click', exitBattleHandler);
        }
        
        // 定义退出处理函数
        function exitBattleHandler() {
            console.log("退出战斗处理函数被调用");
            
            // 隐藏容器
            canvasContainer.style.display = 'none';
            mapContainer.style.display = 'block';
            battleLogElement.innerHTML = '';
            
            // 移除战斗按钮
            const buttonContainer = document.getElementById('battle-buttons-container');
            if (buttonContainer) {
                buttonContainer.remove();
            }
            
            // 重置模型引用
            playerModel = enemyModel = null;
            
            // 清除全局战斗数据
            window.battlePlayer = window.battleEnemy = null;
            
            // 恢复地图背景音乐
            const mapMusic = document.getElementById('map-music');
            if (mapMusic) {
                mapMusic.currentTime = 0;
                mapMusic.volume = 0.2;
                mapMusic.play();
            }
            
            // 回调
            if (typeof window.onBattleEnd === 'function') {
                window.onBattleEnd(isWin);
            }
            
            // 延迟一下执行刷新，确保DOM已完全更新
            setTimeout(() => {
                console.log("延迟刷新怪物标记");
                // 强制重新创建怪物标记
                refreshAllMonsterMarkers();
            }, 100);
        }
        
        // 战斗结束后更新玩家属性面板
        updatePlayerStatsPanel();
        
        // 在战斗结束时立即安排刷新所有怪物标记
        setTimeout(() => {
            console.log("战斗结束，刷新怪物标记");
            refreshAllMonsterMarkers();
        }, 500);  // 延迟一点时间，确保其他操作完成
        
        // 在战斗结束时保存游戏数据
        saveGameData();
    }

    // 将executePlayerTurn暴露为全局函数，供按钮调用
    window.executePlayerTurn = executePlayerTurn;
    
    // 将executeEnemyTurn也暴露为全局函数，供逃跑动作使用
    window.executeEnemyTurn = executeEnemyTurn;
}

// 将endBattle函数暴露为window.startBattle的属性，以便在handleRetreatAction中使用
window.startBattle.endBattle = function(isWin, isRetreat = false) {
    // 移除窗口大小变化监听
    window.removeEventListener('resize', handleWindowResize);
    
    // 禁用战斗按钮
    setBattleButtonsEnabled(false);
    
    // 停止战斗背景音乐
    const battleMusic = document.getElementById('battle-music');
    if (battleMusic) {
        battleMusic.pause();
        battleMusic.currentTime = 0;
    }
    
    // 每次战斗开始时玩家都是满血状态，不需要保存战斗结束时的血量
    
    // 显示结束信息
    if (isWin) {
        // ... existing win code ...
    } else if (isRetreat) {
        showBattleLog('你成功撤退了！');
        
        // 隐藏战斗场景
        if (animationId) {
            cancelAnimationFrame(animationId);
            animationId = null;
        }
        if (controls) {
            controls.dispose(); // 释放控制器
            controls = null;
        }
        // 释放渲染器
        if (renderer) {
            renderer.dispose();
            renderer = null;
        }
        // 清空场景(仅在场景存在且模型加载完成时)
        if (scene && (playerModel || enemyModel)) {
            if (playerModel && scene.children.includes(playerModel)) {
                scene.remove(playerModel);
            }
            if (enemyModel && scene.children.includes(enemyModel)) {
                scene.remove(enemyModel);
            }
            scene = null;
        }
        
        // 显示退出战斗按钮
        exitBattleButton.style.display = 'block';
        // 先移除旧的点击事件监听器
        exitBattleButton.removeEventListener('click', exitBattleHandler);
        // 添加新的点击事件监听器
        exitBattleButton.addEventListener('click', exitBattleHandler);
    } else {
        // ... existing defeat code ...
    }
    
    // 定义退出处理函数
    function exitBattleHandler() {
        // ... existing exitBattleHandler code ...
        
        // 隐藏容器
        canvasContainer.style.display = 'none';
        mapContainer.style.display = 'block';
        
        // 清空战斗日志
        if (battleLogElement) {
            battleLogElement.innerHTML = '';
        }
        
        // 移除战斗按钮
        const buttonContainer = document.getElementById('battle-buttons-container');
        if (buttonContainer) {
            buttonContainer.remove();
        }
        
        // 重置模型引用
        playerModel = enemyModel = null;
        
        // 清除全局战斗数据
        window.battlePlayer = window.battleEnemy = null;
        
        // 恢复地图背景音乐
        const mapMusic = document.getElementById('map-music');
        if (mapMusic) {
            mapMusic.currentTime = 0;
            mapMusic.volume = 0.2;
            mapMusic.play();
        }
        
        // 回调
        if (typeof window.onBattleEnd === 'function') {
            window.onBattleEnd(isWin);
        }
        
        // 刷新怪物标记
        setTimeout(() => {
            refreshAllMonsterMarkers();
        }, 100);
    }
    
    // 战斗结束后更新玩家属性面板
    updatePlayerStatsPanel();
    
    // 在战斗结束时立即安排刷新所有怪物标记
    setTimeout(() => {
        console.log("战斗结束，刷新怪物标记");
        refreshAllMonsterMarkers();
    }, 500);  // 延迟一点时间，确保其他操作完成
    
    // 在战斗结束时保存游戏数据
    saveGameData();
};

// 创建流血特效
function createBloodEffect(target) {
    if (!target || !scene) return;
    
    console.log('创建流血特效');
    
    // 创建粒子系统 - 红色粒子代表血液
    const particleCount = 30;
    const particles = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    
    // 获取目标位置
    const targetPosition = target.position.clone();
    targetPosition.y += 0.5; // 从角色身体中部开始
    
    // 粒子起始位置
    for (let i = 0; i < particleCount; i++) {
        // 随机位置 (在角色周围小范围内)
        positions[i * 3] = targetPosition.x + (Math.random() - 0.5) * 0.2;
        positions[i * 3 + 1] = targetPosition.y + (Math.random() - 0.5) * 0.2;
        positions[i * 3 + 2] = targetPosition.z + (Math.random() - 0.5) * 0.2;
    }
    
    particles.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    
    // 创建粒子材质
    const particleMaterial = new THREE.PointsMaterial({
        color: 0xff0000,
        size: 0.05,
        transparent: true,
        opacity: 0.8
    });
    
    const particleSystem = new THREE.Points(particles, particleMaterial);
    scene.add(particleSystem);
    
    // 粒子动画
    const velocities = [];
    for (let i = 0; i < particleCount; i++) {
        // 随机速度 (主要向下和稍微向外扩散)
        velocities.push({
            x: (Math.random() - 0.5) * 0.1,
            y: -Math.random() * 0.1 - 0.05, // 主要向下
            z: (Math.random() - 0.5) * 0.1
        });
    }
    
    let lastTime = performance.now();
    
    function animateBlood() {
        const now = performance.now();
        const deltaTime = (now - lastTime) / 1000; // 转换为秒
        lastTime = now;
        
        const positions = particleSystem.geometry.attributes.position.array;
        
        // 更新粒子位置
        for (let i = 0; i < particleCount; i++) {
            positions[i * 3] += velocities[i].x * deltaTime * 5;
            positions[i * 3 + 1] += velocities[i].y * deltaTime * 5;
            positions[i * 3 + 2] += velocities[i].z * deltaTime * 5;
            
            // 粒子寿命/透明度处理
            velocities[i].y -= 0.01 * deltaTime; // 加速下落
        }
        
        particleSystem.geometry.attributes.position.needsUpdate = true;
        particleMaterial.opacity -= 0.01;
        
        if (particleMaterial.opacity > 0) {
            requestAnimationFrame(animateBlood);
        } else {
            // 清理特效
            scene.remove(particleSystem);
            particleSystem.geometry.dispose();
            particleMaterial.dispose();
        }
    }
    
    // 开始动画
    animateBlood();
}

// 创建火焰攻击特效
function createFireEffect(source, target) {
    if (!source || !target || !scene) return;
    
    console.log('创建火焰攻击特效');
    
    // 创建火焰粒子系统
    const particleCount = 50;
    const particles = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    
    // 获取起点和终点
    const sourcePosition = source.position.clone();
    sourcePosition.y += 0.2; // 从手部位置发射
    const targetPosition = target.position.clone();
    
    // 粒子起始位置
    for (let i = 0; i < particleCount; i++) {
        // 全部从源点开始
        positions[i * 3] = sourcePosition.x;
        positions[i * 3 + 1] = sourcePosition.y;
        positions[i * 3 + 2] = sourcePosition.z;
    }
    
    particles.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    
    // 创建火焰材质 - 使用红黄渐变色
    const particleMaterial = new THREE.PointsMaterial({
        color: new THREE.Color(Math.random() > 0.5 ? 0xff6600 : 0xffcc00), // 随机火焰颜色
        size: 0.08,
        transparent: true,
        opacity: 0.9
    });
    
    const particleSystem = new THREE.Points(particles, particleMaterial);
    scene.add(particleSystem);
    
    // 计算方向向量
    const direction = new THREE.Vector3().subVectors(targetPosition, sourcePosition).normalize();
    
    // 粒子动画
    const velocities = [];
    const lifeSpans = [];
    
    for (let i = 0; i < particleCount; i++) {
        // 基本速度是向目标方向，加一点随机性
        velocities.push({
            x: direction.x + (Math.random() - 0.5) * 0.2,
            y: direction.y + (Math.random() - 0.5) * 0.2,
            z: direction.z + (Math.random() - 0.5) * 0.2
        });
        
        // 粒子生命周期随机
        lifeSpans.push(Math.random() * 0.5 + 0.5);
    }
    
    // 添加光照效果增强视觉效果
    const fireLight = new THREE.PointLight(0xff6600, 1, 3);
    fireLight.position.copy(sourcePosition);
    scene.add(fireLight);
    
    let lastTime = performance.now();
    
    function animateFire() {
        const now = performance.now();
        const deltaTime = (now - lastTime) / 1000; // 转换为秒
        lastTime = now;
        
        const positions = particleSystem.geometry.attributes.position.array;
        let allParticlesDead = true;
        
        // 更新粒子位置
        for (let i = 0; i < particleCount; i++) {
            if (lifeSpans[i] > 0) {
                allParticlesDead = false;
                
                positions[i * 3] += velocities[i].x * deltaTime * 10; // 火焰速度快一些
                positions[i * 3 + 1] += velocities[i].y * deltaTime * 10;
                positions[i * 3 + 2] += velocities[i].z * deltaTime * 10;
                
                // 减少生命值
                lifeSpans[i] -= deltaTime;
                
                // 靠近目标后转向上方（模拟火焰上升）
                const particlePos = new THREE.Vector3(
                    positions[i * 3], 
                    positions[i * 3 + 1], 
                    positions[i * 3 + 2]
                );
                
                if (particlePos.distanceTo(targetPosition) < 0.5) {
                    velocities[i].y += 0.05; // 向上漂移
                    velocities[i].x *= 0.9; // 减少水平移动
                    velocities[i].z *= 0.9;
                }
            } else {
                // 粒子"死亡"，设置到看不见的位置
                positions[i * 3] = -1000;
                positions[i * 3 + 1] = -1000;
                positions[i * 3 + 2] = -1000;
            }
        }
        
        particleSystem.geometry.attributes.position.needsUpdate = true;
        
        // 移动光源跟随火焰
        fireLight.position.x += direction.x * deltaTime * 5;
        fireLight.position.y += direction.y * deltaTime * 5;
        fireLight.position.z += direction.z * deltaTime * 5;
        
        // 减少光照亮度
        fireLight.intensity -= deltaTime;
        
        if (!allParticlesDead && fireLight.intensity > 0) {
            requestAnimationFrame(animateFire);
        } else {
            // 清理特效
            scene.remove(particleSystem);
            scene.remove(fireLight);
            particleSystem.geometry.dispose();
            particleMaterial.dispose();
        }
    }
    
    // 开始动画
    animateFire();
}

// 创建打击爆炸特效
function createHitExplosion(target) {
    if (!target || !scene) return;
    
    console.log('创建打击爆炸特效');
    
    // 获取目标位置
    const position = target.position.clone();
    
    // 创建爆炸光晕
    const explosionGeometry = new THREE.SphereGeometry(0.2, 16, 16);
    const explosionMaterial = new THREE.MeshBasicMaterial({
        color: 0xffff00,
        transparent: true,
        opacity: 0.7
    });
    
    const explosion = new THREE.Mesh(explosionGeometry, explosionMaterial);
    explosion.position.copy(position);
    scene.add(explosion);
    
    // 添加冲击波环
    const ringGeometry = new THREE.RingGeometry(0.1, 0.2, 32);
    const ringMaterial = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.5,
        side: THREE.DoubleSide
    });
    
    const ring = new THREE.Mesh(ringGeometry, ringMaterial);
    ring.position.copy(position);
    // 旋转环使其面向相机
    ring.lookAt(camera.position);
    scene.add(ring);
    
    // 创建闪光
    const flashLight = new THREE.PointLight(0xffffff, 2, 3);
    flashLight.position.copy(position);
    scene.add(flashLight);
    
    // 爆炸动画
    let scale = 1;
    const startTime = performance.now();
    const duration = 0.5; // 持续半秒
    
    function animateExplosion() {
        const elapsed = (performance.now() - startTime) / 1000;
        const progress = Math.min(elapsed / duration, 1.0);
        
        // 爆炸光晕扩大然后消失
        explosion.scale.set(1 + progress * 2, 1 + progress * 2, 1 + progress * 2);
        explosionMaterial.opacity = 0.7 * (1 - progress);
        
        // 冲击波环扩大
        ring.scale.set(1 + progress * 4, 1 + progress * 4, 1);
        ringMaterial.opacity = 0.5 * (1 - progress);
        
        // 闪光亮度衰减
        flashLight.intensity = 2 * (1 - progress);
        
        if (progress < 1.0) {
            requestAnimationFrame(animateExplosion);
        } else {
            // 清理特效
            scene.remove(explosion);
            scene.remove(ring);
            scene.remove(flashLight);
            explosionGeometry.dispose();
            explosionMaterial.dispose();
            ringGeometry.dispose();
            ringMaterial.dispose();
        }
    }
    
    // 开始动画
    animateExplosion();
}

// 创建战斗操作按钮
function createBattleButtons() {
    const container = document.getElementById('battle-container');
    
    // 清除所有现有按钮
    const existingButtons = container.querySelectorAll('.battle-button');
    existingButtons.forEach(button => {
        if (button && button.parentNode) {
            button.parentNode.removeChild(button);
        }
    });
    
    console.log('创建战斗操作按钮');
    
    // 创建按钮容器
    const buttonContainer = document.createElement('div');
    buttonContainer.id = 'battle-buttons-container';
    buttonContainer.style.position = 'absolute';
    buttonContainer.style.bottom = '5%';
    buttonContainer.style.left = '50%';
    buttonContainer.style.transform = 'translateX(-50%)';
    buttonContainer.style.display = 'flex';
    buttonContainer.style.flexDirection = 'row';
    buttonContainer.style.flexWrap = 'nowrap';
    buttonContainer.style.justifyContent = 'center';
    buttonContainer.style.alignItems = 'center';
    buttonContainer.style.gap = '20px';
    buttonContainer.style.width = 'auto';
    buttonContainer.style.maxWidth = '90%';
    buttonContainer.style.zIndex = '1000';
    buttonContainer.style.transition = 'all 0.3s ease';
    buttonContainer.style.padding = '10px';
    buttonContainer.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
    buttonContainer.style.borderRadius = '10px';
    
    // 按钮样式设置函数
    function styleButton(button, color, hoverColor) {
        button.classList.add('battle-button');
        button.style.padding = '15px 30px';
        button.style.fontSize = '16px';
        button.style.fontWeight = 'bold';
        button.style.backgroundColor = color;
        button.style.color = 'white';
        button.style.border = 'none';
        button.style.borderRadius = '8px';
        button.style.cursor = 'pointer';
        button.style.transition = 'all 0.3s ease';
        button.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.3)';
        button.style.minWidth = '100px';
        button.style.textAlign = 'center';
        button.style.margin = '0';
        button.style.flex = '1';
        button.style.maxWidth = '200px';
        button.style.textShadow = '1px 1px 2px rgba(0,0,0,0.5)';
        
        // 悬停效果
        button.addEventListener('mouseover', () => {
            button.style.backgroundColor = hoverColor;
            button.style.transform = 'translateY(-3px)';
            button.style.boxShadow = '0 6px 12px rgba(0, 0, 0, 0.4)';
        });
        
        button.addEventListener('mouseout', () => {
            button.style.backgroundColor = color;
            button.style.transform = 'translateY(0)';
            button.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.3)';
        });
        
        // 点击效果
        button.addEventListener('mousedown', () => {
            button.style.transform = 'translateY(2px)';
            button.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.3)';
        });
        
        button.addEventListener('mouseup', () => {
            button.style.transform = 'translateY(-3px)';
            button.style.boxShadow = '0 6px 12px rgba(0, 0, 0, 0.4)';
        });
    }
    
    // 创建攻击按钮
    const attackButton = document.createElement('button');
    attackButton.id = 'attack-button';
    attackButton.textContent = '攻击';
    styleButton(attackButton, '#e74c3c', '#c0392b');
    attackButton.addEventListener('click', handleAttackAction);
    
    // 创建防御按钮
    const defendButton = document.createElement('button');
    defendButton.id = 'defend-button';
    defendButton.textContent = '防御';
    styleButton(defendButton, '#3498db', '#2980b9');
    defendButton.addEventListener('click', handleDefendAction);
    
    // 创建恢复按钮
    const healButton = document.createElement('button');
    healButton.id = 'heal-button';
    healButton.textContent = '恢复';
    styleButton(healButton, '#2ecc71', '#27ae60');
    healButton.addEventListener('click', handleHealAction);
    
    // 创建撤退按钮
    const retreatButton = document.createElement('button');
    retreatButton.id = 'retreat-button';
    retreatButton.textContent = '撤退';
    styleButton(retreatButton, '#95a5a6', '#7f8c8d');
    retreatButton.addEventListener('click', handleRetreatAction);
    
    // 添加按钮到容器
    buttonContainer.appendChild(attackButton);
    buttonContainer.appendChild(defendButton);
    buttonContainer.appendChild(healButton);
    buttonContainer.appendChild(retreatButton);
    
    // 添加容器到战斗界面
    container.appendChild(buttonContainer);
    
    console.log('战斗操作按钮创建完成');
    
    // 应用响应式布局
    updateBattleUIPositions();
    
    return buttonContainer;
}

// 禁用/启用战斗按钮
function setBattleButtonsEnabled(enabled) {
    const buttons = document.querySelectorAll('.battle-button');
    buttons.forEach(button => {
        button.disabled = !enabled;
        button.style.opacity = enabled ? '1' : '0.5';
        button.style.cursor = enabled ? 'pointer' : 'not-allowed';
    });
}

// 战斗按钮处理函数
function handleAttackAction() {
    console.log('玩家选择攻击');
    
    // 检查是否在玩家回合且没有正在执行的动作
    if (!isPlayerTurn || isActionInProgress) {
        console.log('当前不能执行攻击');
        return;
    }
    
    // 设置动作执行中标志
    isActionInProgress = true;
    
    // 禁用所有按钮
    setBattleButtonsEnabled(false);
    
    // 执行玩家攻击
    executePlayerTurn('attack');
}

function handleDefendAction() {
    console.log('玩家选择防御');
    
    // 检查是否在玩家回合且没有正在执行的动作
    if (!isPlayerTurn || isActionInProgress) {
        console.log('当前不能执行防御');
        return;
    }
    
    // 设置动作执行中标志
    isActionInProgress = true;
    
    // 禁用所有按钮
    setBattleButtonsEnabled(false);
    
    // 执行玩家防御
    executePlayerTurn('defend');
}

function handleHealAction() {
    console.log('玩家选择恢复');
    
    // 检查是否在玩家回合且没有正在执行的动作
    if (!isPlayerTurn || isActionInProgress) {
        console.log('当前不能执行恢复');
        return;
    }
    
    // 设置动作执行中标志
    isActionInProgress = true;
    
    // 禁用所有按钮
    setBattleButtonsEnabled(false);
    
    // 执行玩家恢复
    executePlayerTurn('heal');
}

function handleRetreatAction() {
    // 检查是否在玩家回合且没有正在执行的动作
    if (!isPlayerTurn || isActionInProgress) {
        console.log('当前不能执行撤退');
        return;
    }
    
    // 设置动作执行中标志
    isActionInProgress = true;
    
    setBattleButtonsEnabled(false);
    
    // 获取全局战斗数据
    const player = window.battlePlayer;
    const enemy = window.battleEnemy;
    
    if (!player || !enemy) {
        console.error("战斗数据未初始化，无法撤退");
        return;
    }
    
    // 每次战斗开始时玩家都是满血状态，不需要保存战斗结束时的血量
    
    showBattleLog("你试图逃离战斗...");
    
    // 播放撤退音效
    const runSound = document.getElementById('run-sound');
    if (runSound) {
        runSound.currentTime = 0;
        runSound.play();
    }
    
    // 播放撤退动画（如果有）
    if (playerActions['Run'] || playerActions['retreat']) {
        const action = playerActions['Run'] || playerActions['retreat'];
        action.reset().play();
    }
    
    // 创建撤退特效
    const retreatDuration = createRetreatEffect(playerModel);
    
    // 根据速度计算逃跑成功率
    const escapeChance = 0.75; // 75%的固定成功率
    const isEscapeSuccessful = Math.random() < escapeChance;
    
    console.log(`逃跑尝试 - 成功率: ${(escapeChance * 100).toFixed(2)}%, 结果: ${isEscapeSuccessful ? "成功" : "失败"}`);
    
    // 等待撤退特效播放一段时间后再决定逃跑结果
    setTimeout(() => {
        if (isEscapeSuccessful) {
            showBattleLog('逃跑成功！');
            
            // 清理战斗场景
            if (animationId) {
                cancelAnimationFrame(animationId);
                animationId = null;
            }
            if (controls) {
                controls.dispose(); // 释放控制器
                controls = null;
            }
            // 释放渲染器
            if (renderer) {
                renderer.dispose();
                renderer = null;
            }
            // 清空场景(仅在场景存在且模型加载完成时)
            if (scene && (playerModel || enemyModel)) {
                if (playerModel && scene.children.includes(playerModel)) {
                    scene.remove(playerModel);
                }
                if (enemyModel && scene.children.includes(enemyModel)) {
                    scene.remove(enemyModel);
                }
                scene = null;
            }
            
            // 停止战斗背景音乐
            const battleMusic = document.getElementById('battle-music');
            if (battleMusic) {
                battleMusic.pause();
                battleMusic.currentTime = 0;
            }
            
            // 显示退出战斗按钮
            exitBattleButton.style.display = 'block';
            
            // 先移除旧的点击事件监听器，防止多次绑定
            exitBattleButton.removeEventListener('click', handleExitBattle);
            
            // 定义退出战斗的处理函数
            function handleExitBattle() {
                console.log("退出战斗按钮被点击");
                
                // 隐藏战斗界面，显示地图
                const battleContainer = document.getElementById('battle-container');
                battleContainer.style.display = 'none';
                mapContainer.style.display = 'block';
                
                // 清空战斗日志
                battleLogElement.innerHTML = '';
                
                // 移除战斗按钮
                const buttonContainer = document.getElementById('battle-buttons-container');
                if (buttonContainer) {
                    buttonContainer.remove();
                }
                
                // 重置模型引用
                playerModel = null;
                enemyModel = null;
                
                // 清除全局战斗数据
                window.battlePlayer = null;
                window.battleEnemy = null;
                
                // 恢复地图背景音乐
                const mapMusic = document.getElementById('map-music');
                if (mapMusic) {
                    mapMusic.currentTime = 0;
                    mapMusic.volume = 0.2;
                    mapMusic.play();
                }
                
                // 调用战斗结束回调
                if (typeof window.onBattleEnd === 'function') {
                    window.onBattleEnd(false);
                }
                
                // 强制刷新怪物标记
                setTimeout(() => {
                    refreshAllMonsterMarkers();
                }, 100);
            }
            
            // 添加新的点击事件监听器
            exitBattleButton.addEventListener('click', handleExitBattle);
            
        } else {
            showBattleLog('逃跑失败！敌人拦住了你的去路。');
            // 继续进入敌人回合
            setTimeout(executeEnemyTurn, 500);
        }
    }, Math.min(1000, retreatDuration * 1000 / 2)); // 使用撤退特效持续时间的一半，但最多1秒
}

// 创建防御盾特效
function createShieldEffect(target) {
    if (!target || !scene) return;
    
    console.log('创建防御盾特效');
    
    // 创建盾牌几何体
    const shieldGeometry = new THREE.SphereGeometry(0.8, 32, 32);
    const shieldMaterial = new THREE.MeshBasicMaterial({
        color: 0x3498db,
        transparent: true,
        opacity: 0.5,
        side: THREE.DoubleSide
    });
    
    const shield = new THREE.Mesh(shieldGeometry, shieldMaterial);
    shield.position.copy(target.position);
    scene.add(shield);
    
    // 添加盾牌光晕
    const glowGeometry = new THREE.SphereGeometry(0.9, 32, 32);
    const glowMaterial = new THREE.MeshBasicMaterial({
        color: 0x00ffff,
        transparent: true,
        opacity: 0.3,
        side: THREE.DoubleSide
    });
    
    const glow = new THREE.Mesh(glowGeometry, glowMaterial);
    glow.position.copy(target.position);
    scene.add(glow);
    
    // 添加盾牌环
    const ringGeometry = new THREE.RingGeometry(0.7, 0.9, 32);
    const ringMaterial = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.7,
        side: THREE.DoubleSide
    });
    
    const ring = new THREE.Mesh(ringGeometry, ringMaterial);
    ring.position.copy(target.position);
    ring.lookAt(camera.position);
    scene.add(ring);
    
    // 添加防御光效
    const shieldLight = new THREE.PointLight(0x3498db, 1, 3);
    shieldLight.position.copy(target.position);
    scene.add(shieldLight);
    
    // 动画效果
    const startTime = performance.now();
    const duration = 3.0; // 持续3秒
    
    function animateShield() {
        const elapsed = (performance.now() - startTime) / 1000;
        const progress = elapsed / duration;
        
        if (progress < 1.0) {
            // 盾牌缓慢旋转和脉冲
            shield.rotation.y += 0.01;
            glow.rotation.y -= 0.005;
            
            const pulseScale = 1 + 0.1 * Math.sin(elapsed * 5);
            shield.scale.set(pulseScale, pulseScale, pulseScale);
            
            // 光环旋转
            ring.lookAt(camera.position);
            ring.rotation.z += 0.01;
            
            requestAnimationFrame(animateShield);
        } else {
            // 清理特效
            scene.remove(shield);
            scene.remove(glow);
            scene.remove(ring);
            scene.remove(shieldLight);
            
            shieldGeometry.dispose();
            shieldMaterial.dispose();
            glowGeometry.dispose();
            glowMaterial.dispose();
            ringGeometry.dispose();
            ringMaterial.dispose();
        }
    }
    
    animateShield();
    return duration; // 返回特效持续时间
}

// 创建恢复特效
function createHealEffect(target) {
    if (!target || !scene) return;
    
    console.log('创建恢复特效');
    
    // 创建光环粒子系统
    const particleCount = 50;
    const particles = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    
    // 获取目标位置
    const targetPosition = target.position.clone();
    
    // 粒子起始位置 - 在角色周围形成一个圆环
    for (let i = 0; i < particleCount; i++) {
        const angle = (i / particleCount) * Math.PI * 2;
        const radius = 0.8;
        positions[i * 3] = targetPosition.x + Math.cos(angle) * radius;
        positions[i * 3 + 1] = targetPosition.y - 0.5 + Math.random() * 1.0; // 从下到上分布
        positions[i * 3 + 2] = targetPosition.z + Math.sin(angle) * radius;
    }
    
    particles.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    
    // 创建绿色粒子材质
    const particleMaterial = new THREE.PointsMaterial({
        color: 0x2ecc71,
        size: 0.08,
        transparent: true,
        opacity: 0.8
    });
    
    const particleSystem = new THREE.Points(particles, particleMaterial);
    scene.add(particleSystem);
    
    // 添加恢复光效
    const healLight = new THREE.PointLight(0x2ecc71, 1.5, 3);
    healLight.position.copy(targetPosition);
    scene.add(healLight);
    
    // 恢复动画
    const startTime = performance.now();
    const duration = 2.0; // 持续2秒
    
    function animateHeal() {
        const elapsed = (performance.now() - startTime) / 1000;
        const progress = elapsed / duration;
        
        if (progress < 1.0) {
            // 更新粒子位置 - 螺旋上升
            const positions = particleSystem.geometry.attributes.position.array;
            
            for (let i = 0; i < particleCount; i++) {
                const angle = (i / particleCount) * Math.PI * 2 + elapsed * 2;
                const radius = 0.8 * (1 - progress * 0.7); // 逐渐缩小半径
                
                positions[i * 3] = targetPosition.x + Math.cos(angle) * radius;
                positions[i * 3 + 1] += 0.02; // 向上移动
                positions[i * 3 + 2] = targetPosition.z + Math.sin(angle) * radius;
            }
            
            particleSystem.geometry.attributes.position.needsUpdate = true;
            
            // 光照效果渐变
            healLight.intensity = 1.5 * (1 - progress * 0.5);
            
            requestAnimationFrame(animateHeal);
        } else {
            // 清理特效
            scene.remove(particleSystem);
            scene.remove(healLight);
            particleSystem.geometry.dispose();
            particleMaterial.dispose();
        }
    }
    
    animateHeal();
    return duration; // 返回特效持续时间
}

// 创建撤退特效
function createRetreatEffect(target) {
    if (!target || !scene) return 0;
    
    console.log('创建撤退特效');
    
    // 创建烟雾粒子系统
    const particleCount = 40;
    const particles = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    
    // 获取目标位置
    const targetPosition = target.position.clone();
    
    // 粒子起始位置
    for (let i = 0; i < particleCount; i++) {
        positions[i * 3] = targetPosition.x + (Math.random() - 0.5) * 0.5;
        positions[i * 3 + 1] = targetPosition.y + (Math.random() - 0.5) * 0.5;
        positions[i * 3 + 2] = targetPosition.z + (Math.random() - 0.5) * 0.5;
    }
    
    particles.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    
    // 创建灰色烟雾粒子材质
    const particleMaterial = new THREE.PointsMaterial({
        color: 0xaaaaaa,
        size: 0.10,
        transparent: true,
        opacity: 0.7
    });
    
    const particleSystem = new THREE.Points(particles, particleMaterial);
    scene.add(particleSystem);
    
    // 粒子动画
    const velocities = [];
    
    for (let i = 0; i < particleCount; i++) {
        // 随机速度
        velocities.push({
            x: (Math.random() - 0.5) * 0.2,
            y: Math.random() * 0.1,
            z: (Math.random() - 0.5) * 0.2
        });
    }
    
    // 原始角色位置和缩放
    const originalPosition = target.position.clone();
    const originalScale = target.scale.clone();
    
    // 撤退动画
    const startTime = performance.now();
    const duration = 1.5; // 缩短持续时间为1.5秒
    
    function animateRetreat() {
        const elapsed = (performance.now() - startTime) / 1000;
        const progress = Math.min(elapsed / duration, 1.0);
        
        if (progress < 1.0) {
            // 更新粒子位置
            const positions = particleSystem.geometry.attributes.position.array;
            
            for (let i = 0; i < particleCount; i++) {
                positions[i * 3] += velocities[i].x;
                positions[i * 3 + 1] += velocities[i].y;
                positions[i * 3 + 2] += velocities[i].z;
            }
            
            particleSystem.geometry.attributes.position.needsUpdate = true;
            
            // 角色缩小并后退效果 - 加快缩小速度以匹配更短的动画时间
            const newScale = 1.0 - progress * 0.8;
            target.scale.set(newScale, newScale, newScale);
            
            // 向后移动 - 加大速度以匹配更短的动画时间
            target.position.x = originalPosition.x - progress * 5;
            
            // 增加烟雾
            if (progress < 0.85 && Math.random() > 0.7) {
                const idx = Math.floor(Math.random() * particleCount);
                positions[idx * 3] = target.position.x + (Math.random() - 0.5) * 0.3;
                positions[idx * 3 + 1] = target.position.y + (Math.random() - 0.5) * 0.3;
                positions[idx * 3 + 2] = target.position.z + (Math.random() - 0.5) * 0.3;
            }
            
            requestAnimationFrame(animateRetreat);
        } else {
            // 清理特效
            scene.remove(particleSystem);
            particleSystem.geometry.dispose();
            particleMaterial.dispose();
            
            // 恢复角色位置和缩放
            target.position.copy(originalPosition);
            target.scale.copy(originalScale);
        }
    }
    
    animateRetreat();
    return duration; // 返回特效持续时间
}

// 添加敌人被打败特效
function createDefeatEffect(target) {
    if (!target || !scene) return 0;
    
    console.log('创建敌人被打败特效');
    
    // 保存原始位置和缩放
    const originalPosition = target.position.clone();
    const originalScale = target.scale.clone();
    
    // 确保目标在开始时可见
    target.visible = true;
    
    // 创建目标的克隆以防止原模型被修改导致问题
    let clonedTarget = null;
    
    // 预先设置敌人模型的材质为透明，但保留完全不透明状态
    target.traverse(function(child) {
        if (child.isMesh && child.material) {
            if (Array.isArray(child.material)) {
                child.material.forEach(mat => {
                    // 只设置transparent属性，不改变opacity
                    mat.originalOpacity = mat.opacity;
                    mat.transparent = true;
                });
            } else {
                child.material.originalOpacity = child.material.opacity;
                child.material.transparent = true;
            }
        }
    });
    
    // 降低粒子数量以减少卡顿
    const particleCount = 60; // 从100减少到60
    const particleBatches = 3; // 从4批减少到3批
    const particlesPerBatch = Math.floor(particleCount / particleBatches);
    let particleSystems = [];
    let velocities = [];
    
    // 获取目标位置
    const targetPosition = target.position.clone();
    
    // 创建强烈的爆炸光源
    const explosionLight = new THREE.PointLight(0xFFFFFF, 0.5, 10);
    explosionLight.position.copy(targetPosition);
    scene.add(explosionLight);
    
    // 动画持续时间
    const duration = 2.0; // 从2.5秒减少到2.0秒
    const startTime = performance.now();
    
    // 立即创建第一批粒子，避免延迟
    function createParticleBatch(batchIndex) {
        const count = particlesPerBatch;
        
        // 使用更高效的粒子几何体
        const particles = new THREE.BufferGeometry();
        const positions = new Float32Array(count * 3);
        
        // 所有粒子从目标中心开始，但有微小随机偏移
        for (let i = 0; i < count; i++) {
            positions[i * 3] = targetPosition.x + (Math.random() - 0.5) * 0.1;
            positions[i * 3 + 1] = targetPosition.y + (Math.random() - 0.5) * 0.1;
            positions[i * 3 + 2] = targetPosition.z + (Math.random() - 0.5) * 0.1;
        }
        
        particles.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        
        // 创建粒子材质 - 使用共享材质以提高性能
        const particleMaterial = new THREE.PointsMaterial({
            color: [0xFFD700, 0xFF4500, 0xFF8C00][batchIndex % 3], // 减少颜色变化
            size: 0.04 + Math.random() * 0.04, // 简化大小变化
            transparent: true,
            opacity: 0.5 + Math.random() * 0.4 // 初始不透明度
        });
        
        const particleSystem = new THREE.Points(particles, particleMaterial);
        particleSystem.creationDelay = batchIndex * 0.1; // 每批延迟一点创建
        scene.add(particleSystem);
        particleSystems.push(particleSystem);
        
        // 粒子速度
        const batchVelocities = [];
        for (let i = 0; i < count; i++) {
            // 使用更简单的速度模型
            batchVelocities.push({
                x: (Math.random() - 0.5) * 0.2,
                y: (Math.random() - 0.5) * 0.2 + 0.1, // 稍微向上偏移
                z: (Math.random() - 0.5) * 0.2,
                acceleration: 0.8 + Math.random() * 0.3
            });
        }
        velocities.push(batchVelocities);
    }
    
    // 立即创建初始批次的粒子
    createParticleBatch(0);
    
    // 添加闪光特效
    const flashGeometry = new THREE.SphereGeometry(0.5, 12, 12); // 减少几何体复杂度
    const flashMaterial = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.7
    });
    
    const flash = new THREE.Mesh(flashGeometry, flashMaterial);
    flash.position.copy(targetPosition);
    scene.add(flash);
    
    // 使用更高效的动画帧率控制
    let lastFrameTime = performance.now();
    const targetFrameInterval = 1000 / 30; // 目标30fps，而不是尝试每帧更新
    
    function animateDefeat() {
        const now = performance.now();
        const frameTimeDelta = now - lastFrameTime;
        
        // 控制帧率以减少卡顿
        if (frameTimeDelta < targetFrameInterval) {
            requestAnimationFrame(animateDefeat);
            return;
        }
        lastFrameTime = now;
        
        const elapsed = (now - startTime) / 1000;
        const progress = elapsed / duration;
        
        // 处理初始闪光效果
        if (elapsed < 0.2) {
            // 闪光效果逐渐消失
            flash.scale.set(1 + elapsed * 3, 1 + elapsed * 3, 1 + elapsed * 3);
            flashMaterial.opacity = 0.7 * (1 - elapsed / 0.2);
        } else if (flash.parent) {
            // 移除闪光
            scene.remove(flash);
            flashGeometry.dispose();
            flashMaterial.dispose();
        }
        
        // 按照时间间隔创建其余批次
        if (particleSystems.length < particleBatches) {
            const nextBatchIndex = particleSystems.length;
            if (elapsed > nextBatchIndex * 0.2) {  // 每隔0.2秒创建一批
                createParticleBatch(nextBatchIndex);
            }
        }
        
        if (progress < 1.0) {
            // 爆炸光源强度变化
            explosionLight.intensity = 3 * (1 - progress);
            
            // 批量更新粒子系统 - 减少循环次数
            for (let b = 0; b < particleSystems.length; b++) {
                const particleSystem = particleSystems[b];
                
                // 如果该批次还在延迟创建期，则跳过
                if (elapsed < particleSystem.creationDelay) continue;
                
                const batchElapsed = elapsed - particleSystem.creationDelay;
                if (batchElapsed < 0) continue;
                
                const positions = particleSystem.geometry.attributes.position.array;
                const batchVelocities = velocities[b];
                
                // 以更大步长更新位置，减少计算量
                for (let i = 0; i < batchVelocities.length; i++) {
                    const vel = batchVelocities[i];
                    const accel = vel.acceleration * (1 + progress);
                    
                    positions[i * 3] += vel.x * accel * frameTimeDelta * 0.02;
                    positions[i * 3 + 1] += vel.y * accel * frameTimeDelta * 0.02;
                    positions[i * 3 + 2] += vel.z * accel * frameTimeDelta * 0.02;
                }
                
                particleSystem.geometry.attributes.position.needsUpdate = true;
                
                // 粒子透明度变化 - 简化过渡
                if (progress > 0.5) {
                    particleSystem.material.opacity = 1 - ((progress - 0.5) / 0.5);
                }
            }
            
            // 角色模型效果 - 简化变换
            if (target) {
                // 简化透明度变化
                const modelOpacity = Math.max(0, 1 - progress * 1.2);
                target.traverse(function(child) {
                    if (child.isMesh && child.material) {
                        if (Array.isArray(child.material)) {
                            child.material.forEach(mat => {
                                mat.opacity = mat.originalOpacity * modelOpacity;
                            });
                        } else {
                            child.material.opacity = child.material.originalOpacity * modelOpacity;
                        }
                    }
                });
                
                // 简化缩放和旋转
                const scaleFactor = 1 - progress * 0.6;
                const newScale = originalScale.x * scaleFactor;
                target.scale.set(newScale, newScale, newScale);
                
                // 平滑旋转
                target.rotation.y += 0.01 + 0.02 * progress;
            }
            
            requestAnimationFrame(animateDefeat);
        } else {
            // 清理特效
            particleSystems.forEach(system => {
                scene.remove(system);
                system.geometry.dispose();
                system.material.dispose();
            });
            scene.remove(explosionLight);
            
            // 完全隐藏目标模型
            if (target) {
                target.visible = false;
            }
        }
    }
    
    // 开始动画
    animateDefeat();
    
    // 返回动画持续时间
    return duration;
}

// 处理玩家移动、怪物生成等逻辑
document.addEventListener('DOMContentLoaded', function () {
    // 移除了玩家相关代码
    const coordinateDisplay = document.getElementById('coordinate-display');

    // 移除了原有的更新玩家位置、检查碰撞等功能
    
    // 重新生成怪物的功能保留并移动到了generateMonsters函数

    // 在战斗结束时更新地图和怪物状态
    window.onBattleEnd = function (isWin) {
        const battleContainer = document.getElementById('battle-container');
        battleContainer.style.display = 'none';
        mapContainer.style.display = 'block';
        
        // 确保地图已经初始化
        if (!window.map) {
            console.error("地图未初始化");
            return;
        }
        
        console.log("战斗结束，战斗结果:", isWin ? "胜利" : "失败");
        
        if (isWin && selectedMonster) {
            // 战斗胜利，移除被击败的怪物
            if (selectedMonster.marker) {
                window.map.remove(selectedMonster.marker);
                console.log("已移除被击败的怪物");
            }
            
            // 从数组中删除怪物
            const index = monsters.findIndex(m => m.position[0] === selectedMonster.position[0] && 
                                             m.position[1] === selectedMonster.position[1]);
            if (index > -1) {
                monsters.splice(index, 1);
                console.log("从数组中删除被击败的怪物，剩余怪物:", monsters.length);
            }
            
            // 升级玩家
            playerLevel++;
            playerMaxHP += 10; // 增加最大生命值而不是当前生命值
            playerAttack += 5;
        } else {
            // 战斗失败或逃跑，保持怪物状态不变
            console.log("战斗未胜利，怪物保持不变");
        }
        
        // 重置选中的怪物
        selectedMonster = null;
        
        // 删除当前地图上的所有标记，然后重新创建
        console.log("清除并重新创建地图上的所有怪物标记");
        
        // 备份当前怪物数据
        const monstersCopy = [...monsters];
        
        // 清除地图上所有标记
        monsters.forEach(monster => {
            if (monster.marker) {
                window.map.remove(monster.marker);
            }
        });
        
        // 清空monsters数组
        monsters = [];
        
        // 重新创建怪物标记
        setTimeout(() => {
            monstersCopy.forEach(monster => {
                console.log("重新创建怪物标记:", monster.position);
                
                // 创建怪物图标元素
                const monsterEl = document.createElement('div');
                monsterEl.className = 'enemy';
                
                // 创建标记并添加到地图
                const marker = new AMap.Marker({
                    position: monster.position,
                    content: monsterEl,
                    offset: new AMap.Pixel(-25, -25) // 居中对齐图标
                });
                
                // 将标记添加到地图
                window.map.add(marker);
                
                // 添加点击事件
                marker.on('click', function() {
                    handleMonsterClick({
                        hp: monster.hp,
                        attack: monster.attack,
                        defense: monster.defense,
                        speed: monster.speed,
                        marker: marker,
                        position: monster.position
                    });
                });
                
                // 保存怪物信息到新数组
                monsters.push({
                    marker: marker,
                    hp: monster.hp,
                    attack: monster.attack,
                    defense: monster.defense,
                    speed: monster.speed,
                    position: monster.position
                });
            });
            
            console.log("怪物标记重新创建完成，当前怪物数量:", monsters.length);
            
            // 如果没有怪物了，生成新的怪物
            if (monsters.length === 0) {
                console.log("没有怪物，生成新怪物");
                generateMonsters(false);
            }
        }, 300);
    };
});

// 移除原来的初始化代码，只使用新的初始化函数
document.addEventListener('DOMContentLoaded', function () {
    initAMap();
});

// 处理窗口大小变化
function handleWindowResize() {
    if (camera && renderer && scene) {
        // 更新相机宽高比
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        
        // 更新渲染器大小
        renderer.setSize(window.innerWidth, window.innerHeight);
        
        // 更新战斗UI元素位置
        updateBattleUIPositions();
        
        console.log('窗口大小已更新，战斗界面已调整');
    }
}

// 更新战斗UI元素位置
function updateBattleUIPositions() {
    // 更新血条位置
    const playerHealthContainer = document.getElementById('player-health-container');
    const enemyHealthContainer = document.getElementById('enemy-health-container');
    
    if (playerHealthContainer) {
        playerHealthContainer.style.top = '5%';
        playerHealthContainer.style.left = '5%';
        playerHealthContainer.style.width = Math.min(300, window.innerWidth * 0.3) + 'px';
    }
    
    if (enemyHealthContainer) {
        enemyHealthContainer.style.top = '5%';
        enemyHealthContainer.style.right = '5%';
        enemyHealthContainer.style.width = Math.min(300, window.innerWidth * 0.3) + 'px';
    }
    
    // 获取按钮容器的位置信息，以便正确放置战斗日志
    const buttonContainer = document.getElementById('battle-buttons-container');
    const buttonHeight = buttonContainer ? buttonContainer.offsetHeight : 0;
    const buttonBottom = buttonContainer ? parseInt(buttonContainer.style.bottom || '10%') : 10;
    
    // 更新战斗日志位置 - 根据屏幕大小和按钮位置动态调整
    const battleLog = document.getElementById('battle-log');
    if (battleLog) {
        // 根据屏幕大小调整战斗日志的位置和大小
        if (window.innerWidth < 600) {
            // 小屏幕 - 放在左上角而不是左下角，避免与按钮重叠
            battleLog.style.top = '12%';
            battleLog.style.bottom = 'auto';
            battleLog.style.left = '5%';
            battleLog.style.maxWidth = Math.min(250, window.innerWidth * 0.4) + 'px';
            battleLog.style.maxHeight = Math.min(150, window.innerHeight * 0.25) + 'px';
        } else if (window.innerWidth < 1024) {
            // 中等屏幕 - 放在左侧中部，与按钮保持安全距离
            battleLog.style.top = 'auto';
            battleLog.style.bottom = (buttonBottom + buttonHeight / window.innerHeight * 100 + 10) + '%'; // 按钮顶部上方10%
            battleLog.style.left = '5%';
            battleLog.style.maxWidth = Math.min(350, window.innerWidth * 0.35) + 'px';
            battleLog.style.maxHeight = Math.min(200, window.innerHeight * 0.3) + 'px';
        } else {
            // 大屏幕 - 放在左下角，与按钮保持更大距离
            battleLog.style.top = 'auto';
            battleLog.style.bottom = (buttonBottom + buttonHeight / window.innerHeight * 100 + 15) + '%'; // 按钮顶部上方15%
            battleLog.style.left = '5%';
            battleLog.style.maxWidth = Math.min(500, window.innerWidth * 0.3) + 'px';
            battleLog.style.maxHeight = Math.min(300, window.innerHeight * 0.35) + 'px';
        }
        
        // 增强战斗日志的可见性
        battleLog.style.color = 'white';
        battleLog.style.fontFamily = 'Arial, sans-serif';
        battleLog.style.fontSize = window.innerWidth < 600 ? '14px' : '16px';
        battleLog.style.backgroundColor = 'rgba(0, 0, 0, 0.7)'; // 增加不透明度
        battleLog.style.padding = '10px';
        battleLog.style.borderRadius = '5px';
        battleLog.style.zIndex = '1000';
        battleLog.style.transition = 'all 0.3s ease';
        battleLog.style.textShadow = '1px 1px 2px rgba(0,0,0,0.8)';
        battleLog.style.boxShadow = '0 2px 10px rgba(0, 0, 0, 0.4)'; // 添加阴影
        battleLog.style.border = '1px solid rgba(255, 255, 255, 0.2)'; // 添加边框
    }
    
    // 更新战斗按钮位置和样式
    if (buttonContainer) {
        // 根据屏幕大小调整按钮样式，但始终保持横向排列
        if (window.innerWidth < 600) {
            // 小屏幕时调整
            buttonContainer.style.bottom = '5%'; // 降低位置，远离日志
            buttonContainer.style.gap = '5px';
            buttonContainer.style.maxWidth = '95%';
            
            // 调整按钮大小
            const buttons = buttonContainer.querySelectorAll('.battle-button');
            buttons.forEach(button => {
                button.style.padding = '8px 12px';
                button.style.fontSize = '14px';
                button.style.minWidth = '60px';
                button.style.margin = '3px';
            });
        } else if (window.innerWidth < 1024) {
            // 中等屏幕
            buttonContainer.style.bottom = '8%';
            buttonContainer.style.gap = '8px';
            
            // 调整按钮大小
            const buttons = buttonContainer.querySelectorAll('.battle-button');
            buttons.forEach(button => {
                button.style.padding = '10px 18px';
                button.style.fontSize = '16px';
                button.style.margin = '4px';
            });
        } else {
            // 大屏幕
            buttonContainer.style.bottom = '10%';
            buttonContainer.style.gap = '10px';
            
            // 恢复按钮大小
            const buttons = buttonContainer.querySelectorAll('.battle-button');
            buttons.forEach(button => {
                button.style.padding = '12px 24px';
                button.style.fontSize = '18px';
                button.style.margin = '5px';
            });
        }
    }
    
    // 更新退出按钮位置
    const exitButton = document.getElementById('exit-battle-button');
    if (exitButton) {
        exitButton.style.bottom = '20px';
        exitButton.style.right = '20px';
    }
}

// 播放待机动画的函数
function playIdleAnimation(mixer, actions) {
    // 常见的待机动画名称列表
    const idleNames = [
        'Idle', 'idle', 'IDLE', 
        'Stand', 'stand', 'STAND',
        'Breath', 'breath', 'BREATH',
        'Wait', 'wait', 'WAIT',
        'Rest', 'rest', 'REST'
    ];
    
    // 找到第一个匹配的待机动画并播放
    for (const name of idleNames) {
        if (actions[name]) {
            console.log('播放待机动画:', name);
            
            // 设置动画循环模式为无限循环
            actions[name].reset().setLoop(THREE.LoopRepeat, Infinity);
            
            // 添加一点随机时间偏移，避免多个模型的动画完全同步
            actions[name].timeScale = 0.8 + Math.random() * 0.4; // 0.8-1.2之间的随机速度
            actions[name].play();
            
            return true;
        }
    }
    
    // 如果没有明确的待机动画，但有其他动画，则使用第一个动画
    const actionNames = Object.keys(actions);
    if (actionNames.length > 0) {
        console.log('未找到专门的待机动画，使用默认动画:', actionNames[0]);
        actions[actionNames[0]].reset().setLoop(THREE.LoopRepeat, Infinity);
        actions[actionNames[0]].timeScale = 0.7; // 减慢速度，使其看起来更像待机
        actions[actionNames[0]].play();
        return true;
    }
    
    console.warn('未找到任何可用动画');
    
    // 如果没有任何动画，添加一个简单的上下晃动效果
    if (mixer.getRoot()) {
        const root = mixer.getRoot();
        const originalY = root.position.y;
        
        // 保存原始位置作为引用
        root._originalPosition = originalY;
        
        // 添加自定义更新回调
        mixer._customUpdate = function(deltaTime) {
            if (root && root.position) {
                // 简单的上下晃动
                const time = performance.now() / 1000;
                root.position.y = root._originalPosition + Math.sin(time * 1.5) * 0.03;
                
                // 微小的旋转
                root.rotation.y += deltaTime * 0.1;
            }
        };
        
        return true;
    }
    
    return false;
}

// 修改animate函数，支持自定义更新
function animate() {
    animationId = requestAnimationFrame(animate);
    
    const deltaTime = 0.01;
    
    // 检查玩家模型是否应该保持隐藏
    if (playerModel && playerModel._permanentlyHidden) {
        playerModel.visible = false;
    }
    
    if (playerMixer) {
        playerMixer.update(deltaTime);
        // 执行自定义更新（如果有）
        if (playerMixer._customUpdate) {
            playerMixer._customUpdate(deltaTime);
        }
    }
    
    if (enemyMixer) {
        enemyMixer.update(deltaTime);
        // 执行自定义更新（如果有）
        if (enemyMixer._customUpdate) {
            enemyMixer._customUpdate(deltaTime);
        }
    }
    
    if (controls) controls.update();
    if (renderer) {
        renderer.render(scene, camera);
    }
}

// 在顺序加载中修改animate函数
loadSkyBox(function(skyErr) {
    if (skyErr) {
        console.error('加载天空盒失败:', skyErr);
        showBattleLog('加载场景失败，请重试');
        exitBattleButton.style.display = 'block';
        return;
    }
    
    console.log('开始加载玩家模型...');
    loadPlayerModel(function(playerErr) {
        if (playerErr) {
            console.error('加载玩家模型失败:', playerErr);
            showBattleLog('加载玩家模型失败，请重试');
            exitBattleButton.style.display = 'block';
            return;
        }
        
        console.log('开始加载敌人模型...');
        loadEnemyModel(function(enemyErr) {
            if (enemyErr) {
                console.error('加载敌人模型失败:', enemyErr);
                showBattleLog('加载敌人模型失败，请重试');
                exitBattleButton.style.display = 'block';
                return;
            }
            
            // 所有模型加载完成
            console.log('所有模型加载完成，玩家模型:', playerModel, '敌人模型:', enemyModel);
            createHealthBars(); // 创建2D血条

            // 使用修改后的animate函数
            animationId = requestAnimationFrame(animate);
        });
    });
});

// 添加创建树木的函数
function addTrees() {
    console.log('开始添加树木...');
    
    // 树干材质
    const trunkMaterial = new THREE.MeshStandardMaterial({
        color: 0x8B4513, // 棕色
        roughness: 0.9,
        metalness: 0.1
    });
    
    // 树叶材质 - 两种不同的绿色
    const leafMaterial1 = new THREE.MeshStandardMaterial({
        color: 0x2E8B57, // 深绿色
        roughness: 0.8,
        metalness: 0.0
    });
    
    const leafMaterial2 = new THREE.MeshStandardMaterial({
        color: 0x6B8E23, // 橄榄绿色
        roughness: 0.8,
        metalness: 0.0
    });
    
    // 创建不同类型的树
    function createTreeType1(scale = 1) {
        const treeGroup = new THREE.Group();
        
        
        // 树干 - 稍微降低位置使其嵌入地面
        const trunkGeometry = new THREE.CylinderGeometry(0.2 * scale, 0.3 * scale, 2 * scale, 8);
        const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
        trunk.position.y = (1 * scale) - 0.2; // 减少y轴坐标使树干底部略微低于原点
        trunk.castShadow = true;
        treeGroup.add(trunk);
        
        // 树冠 - 使用多个椭球体，同样降低位置
        const leafMaterial = Math.random() > 0.5 ? leafMaterial1 : leafMaterial2;
        const leafCount = Math.floor(Math.random() * 2) + 3;
        
        for (let i = 0; i < leafCount; i++) {
            const leafSize = (0.8 + Math.random() * 0.4) * scale;
            const leafGeometry = new THREE.SphereGeometry(leafSize, 8, 6);
            const leaf = new THREE.Mesh(leafGeometry, leafMaterial);
            
            // 随机位置，确保在树干顶部附近，同样降低位置
            leaf.position.set(
                (Math.random() - 0.5) * 0.5 * scale,
                (2 + (i * 0.3 + Math.random() * 0.2)) * scale - 0.2, // 减少y轴坐标
                (Math.random() - 0.5) * 0.5 * scale
            );
            
            // 轻微扁平化树冠
            leaf.scale.y = 0.8;
            leaf.castShadow = true;
            treeGroup.add(leaf);
        }
        
        return treeGroup;
    }
    
    // 创建松树类型
    function createTreeType2(scale = 1) {
        const treeGroup = new THREE.Group();
        
        // 树干 - 调整位置使其植根于地面
        const trunkGeometry = new THREE.CylinderGeometry(0.15 * scale, 0.2 * scale, 3 * scale, 8);
        const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
        trunk.position.y = (1.5 * scale) - 0.5; // 降低位置使其扎根地面
        trunk.castShadow = true;
        treeGroup.add(trunk);
        
        // 树冠 - 使用多个圆锥体，同样降低位置
        const leafMaterial = Math.random() > 0.7 ? leafMaterial2 : leafMaterial1;
        const layerCount = Math.floor(Math.random() * 2) + 3;
        
        for (let i = 0; i < layerCount; i++) {
            const coneHeight = (1.2 - i * 0.15) * scale;
            const coneRadius = (0.8 + i * 0.2) * scale;
            const coneGeometry = new THREE.ConeGeometry(coneRadius, coneHeight, 8);
            const cone = new THREE.Mesh(coneGeometry, leafMaterial);
            
            // 从底部到顶部堆叠圆锥，但整体降低高度
            cone.position.y = (1.8 * scale + i * coneHeight * 0.6) - 0.5; // 降低位置
            cone.castShadow = true;
            treeGroup.add(cone);
        }
        
        return treeGroup;
    }
    
    // 简单的低多边形树
    function createTreeType3(scale = 1) {
        const treeGroup = new THREE.Group();
        
        // 树干 - 降低位置使树干底部与地面齐平
        const trunkGeometry = new THREE.CylinderGeometry(0.1 * scale, 0.15 * scale, 0.8 * scale, 5);
        const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
        trunk.position.y = (0.4 * scale) - 0.4; // 设置位置使底部嵌入地面
        trunk.castShadow = true;
        treeGroup.add(trunk);
        
        // 简单的树冠 - 使用一个扁平的椭球体，同样降低
        const leafMaterial = Math.random() > 0.5 ? leafMaterial1 : leafMaterial2;
        const crownGeometry = new THREE.SphereGeometry(0.7 * scale, 6, 4);
        const crown = new THREE.Mesh(crownGeometry, leafMaterial);
        crown.position.y = (1.2 * scale) - 0.4; // 降低树冠位置
        crown.scale.set(1, 0.7, 1); // 压扁
        crown.castShadow = true;
        treeGroup.add(crown);
        
        return treeGroup;
    }
    
    // 添加树木分布圈
    const treeCircles = [
        { minRadius: 18, maxRadius: 25, count: 12 }, // 距离场景中心18-25的范围内添加12棵树
        { minRadius: 30, maxRadius: 50, count: 20 }  // 距离场景中心30-50的范围内添加20棵更多的树
    ];
    
    // 为每个圈添加树木
    treeCircles.forEach(circle => {
        for(let i = 0; i < circle.count; i++) {
            // 随机角度
            const angle = Math.random() * Math.PI * 2;
            // 随机半径（在指定范围内）
            const radius = circle.minRadius + Math.random() * (circle.maxRadius - circle.minRadius);
            
            // 计算位置
            const x = Math.cos(angle) * radius;
            const z = Math.sin(angle) * radius;
            
            // 随机选择树的类型
            let tree;
            const treeType = Math.random();
            const scale = 0.8 + Math.random() * 0.7; // 树木大小随机缩放 0.8-1.5
            
            if (treeType < 0.4) {
                tree = createTreeType1(scale);
            } else if (treeType < 0.7) {
                tree = createTreeType2(scale);
            } else {
                tree = createTreeType3(scale);
            }
            
            // 设置位置 - 将y坐标设为-1，与地面齐平
            tree.position.set(x, -1, z); // 设置y为-1，与地面高度一致
            
            // 随机旋转
            tree.rotation.y = Math.random() * Math.PI * 2;
            
            // 添加到场景
            scene.add(tree);
        }
    });
    
    // 添加几个小树丛组
    for(let i = 0; i < 5; i++) {
        // 创建树丛组
        const bushGroup = new THREE.Group();
        
        // 随机位置 - 在较近的范围内
        const angle = Math.random() * Math.PI * 2;
        const radius = 13 + Math.random() * 5; // 13-18的范围
        const x = Math.cos(angle) * radius;
        const z = Math.sin(angle) * radius;
        
        // 添加3-5棵小树/灌木
        const bushCount = Math.floor(Math.random() * 3) + 3;
        for(let j = 0; j < bushCount; j++) {
            // 灌木都使用小型的树型3
            const bush = createTreeType3(0.4 + Math.random() * 0.3); // 缩小的尺寸
            
            // 在局部区域随机分布
            bush.position.set(
                (Math.random() - 0.5) * 3,
                0, // y坐标设为0，相对于bushGroup
                (Math.random() - 0.5) * 3
            );
            
            // 随机旋转
            bush.rotation.y = Math.random() * Math.PI * 2;
            
            bushGroup.add(bush);
        }
        
        // 设置树丛位置 - 将y坐标设为-1，与地面齐平
        bushGroup.position.set(x, -1, z); // 设置y为-1
        
        // 添加到场景
        scene.add(bushGroup);
    }
    
    console.log('树木添加完成');
}

// 修改loadSkyBox函数，在加载完成后调用添加树木函数
function loadSkyBox(callback) {
    // 创建远景山脉
    createMountains();
    
    // 创建纹理加载器
    const textureLoader = new THREE.TextureLoader();
    
    // 加载草地纹理
    const grassTexturePath = '/static/images/grass.jpg';
    console.log('正在加载草地纹理:', grassTexturePath);
    
    textureLoader.load(grassTexturePath, function(texture) {
        // 创建更大的地面系统

        // 1. 主战斗区域 - 高质量圆形草地
        const battleRadius = 25; // 增加主战场半径从20到25
        const battleGeometry = new THREE.CircleGeometry(battleRadius, 64);
        
        // 设置纹理重复
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(12, 12); // 增加纹理重复次数，从8增加到12
        
        // 创建主战场地面材质
        const battleGroundMaterial = new THREE.MeshStandardMaterial({ 
            map: texture,
            roughness: 0.8,
            metalness: 0.2,
            color: 0x88bb55 // 微微调整草地色调为稍绿
        });
        
        // 创建主战场地面
        const battleGround = new THREE.Mesh(battleGeometry, battleGroundMaterial);
        battleGround.rotation.x = -Math.PI / 2; // 水平放置
        battleGround.position.set(0, -1, 0);
        battleGround.receiveShadow = true;
        scene.add(battleGround);
        
        // 2. 创建中间过渡区域 - 质量略低的圆环
        const midRadius = 60; // 中间地带半径
        const midRingGeometry = new THREE.RingGeometry(battleRadius, midRadius, 64, 4);
        
        // 克隆并修改纹理
        const midTexture = texture.clone();
        midTexture.needsUpdate = true;
        midTexture.repeat.set(30, 30); // 更大的重复
        
        const midGroundMaterial = new THREE.MeshStandardMaterial({
            map: midTexture,
            roughness: 0.9,
            metalness: 0.1,
            color: 0x739349 // 稍深的绿色
        });
        
        const midGround = new THREE.Mesh(midRingGeometry, midGroundMaterial);
        midGround.rotation.x = -Math.PI / 2;
        midGround.position.set(0, -1.1, 0);
        midGround.receiveShadow = true;
        scene.add(midGround);
        
        // 3. 创建远景区域 - 低质量圆环
        const farRadius = 200; // 远景区域半径
        const farRingGeometry = new THREE.RingGeometry(midRadius, farRadius, 64, 4);
        
        // 克隆并修改纹理
        const farTexture = texture.clone();
        farTexture.needsUpdate = true;
        farTexture.repeat.set(50, 50); // 最大的重复
        
        const farGroundMaterial = new THREE.MeshStandardMaterial({
            map: farTexture,
            roughness: 1.0,
            metalness: 0.0,
            color: 0x4a6b2d // 最深的绿色
        });
        
        const farGround = new THREE.Mesh(farRingGeometry, farGroundMaterial);
        farGround.rotation.x = -Math.PI / 2;
        farGround.position.set(0, -1.2, 0);
        farGround.receiveShadow = true;
        scene.add(farGround);
        
        // 添加岩石
        addRocks();
        
        // 添加树木
        addTrees();
        
        // 添加云朵
        createClouds();
        
        if (callback) callback();
    });
}

// 添加敌方火焰特效函数
function createEnemyFireEffect(source, target) {
    if (!source || !target || !scene) return;
    
    console.log('创建敌人蓝色火焰攻击特效');
    
    // 创建火焰粒子系统
    const particleCount = 50;
    const particles = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    
    // 获取起点和终点
    const sourcePosition = source.position.clone();
    sourcePosition.y += 0.2; // 从手部位置发射
    const targetPosition = target.position.clone();
    
    // 粒子起始位置
    for (let i = 0; i < particleCount; i++) {
        positions[i * 3] = sourcePosition.x;
        positions[i * 3 + 1] = sourcePosition.y;
        positions[i * 3 + 2] = sourcePosition.z;
    }
    
    particles.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    
    // 创建蓝色火焰材质
    const particleMaterial = new THREE.PointsMaterial({
        color: Math.random() > 0.5 ? 0x00ffff : 0x0066ff, // 随机蓝色火焰
        size: 0.08,
        transparent: true,
        opacity: 0.9
    });
    
    const particleSystem = new THREE.Points(particles, particleMaterial);
    scene.add(particleSystem);
    
    // 计算方向向量
    const direction = new THREE.Vector3().subVectors(targetPosition, sourcePosition).normalize();
    
    // 粒子动画
    const velocities = [];
    const lifeSpans = [];
    
    for (let i = 0; i < particleCount; i++) {
        velocities.push({
            x: direction.x + (Math.random() - 0.5) * 0.2,
            y: direction.y + (Math.random() - 0.5) * 0.2,
            z: direction.z + (Math.random() - 0.5) * 0.2
        });
        
        lifeSpans.push(Math.random() * 0.5 + 0.5);
    }
    
    // 添加蓝色光照效果
    const fireLight = new THREE.PointLight(0x0066ff, 1, 3);
    fireLight.position.copy(sourcePosition);
    scene.add(fireLight);
    
    let lastTime = performance.now();
    
    function animateFire() {
        const now = performance.now();
        const deltaTime = (now - lastTime) / 1000;
        lastTime = now;
        
        const positions = particleSystem.geometry.attributes.position.array;
        let allParticlesDead = true;
        
        for (let i = 0; i < particleCount; i++) {
            if (lifeSpans[i] > 0) {
                allParticlesDead = false;
                
                positions[i * 3] += velocities[i].x * deltaTime * 10;
                positions[i * 3 + 1] += velocities[i].y * deltaTime * 10;
                positions[i * 3 + 2] += velocities[i].z * deltaTime * 10;
                
                lifeSpans[i] -= deltaTime;
                
                const particlePos = new THREE.Vector3(
                    positions[i * 3], 
                    positions[i * 3 + 1], 
                    positions[i * 3 + 2]
                );
                
                if (particlePos.distanceTo(targetPosition) < 0.5) {
                    velocities[i].y += 0.05;
                    velocities[i].x *= 0.9;
                    velocities[i].z *= 0.9;
                }
            } else {
                positions[i * 3] = -1000;
                positions[i * 3 + 1] = -1000;
                positions[i * 3 + 2] = -1000;
            }
        }
        
        particleSystem.geometry.attributes.position.needsUpdate = true;
        
        fireLight.position.x += direction.x * deltaTime * 5;
        fireLight.position.y += direction.y * deltaTime * 5;
        fireLight.position.z += direction.z * deltaTime * 5;
        
        fireLight.intensity -= deltaTime;
        
        if (!allParticlesDead && fireLight.intensity > 0) {
            requestAnimationFrame(animateFire);
        } else {
            scene.remove(particleSystem);
            scene.remove(fireLight);
            particleSystem.geometry.dispose();
            particleMaterial.dispose();
        }
    }
    
    animateFire();
}

// 添加一个新函数，专门用于完全重新创建怪物标记
function refreshAllMonsterMarkers() {
    console.log("完全重新创建所有怪物标记，当前怪物数量:", monsters.length);
    
    if (monsters.length === 0) {
        console.log("没有怪物，尝试重新生成");
        setTimeout(() => generateMonsters(false), 500);
        return;
    }
    
    // 获取当前地图缩放级别
    const currentZoom = window.map.getZoom();
    const baseSize = calculateIconSize(currentZoom, 24, 48);
    
    // 先移除所有现有的标记，以确保完全重新创建
    monsters.forEach(monster => {
        if (monster.marker) {
            window.map.remove(monster.marker);
            monster.marker = null; // 清除引用
        }
    });
    
    // 为每个怪物重新创建标记
    monsters.forEach(monster => {
        // 保存怪物原始位置和类型
        const position = monster.position;
        const monsterType = monster.type !== undefined ? monster.type : 0;
        
        console.log(`重新创建怪物标记 位置: [${position}], 类型: ${monsterType}`);
        
        // 创建怪物图标元素
        const monsterEl = document.createElement('div');
        monsterEl.className = 'enemy';
        monsterEl.style.display = 'block';
        
        // 根据怪物类型设置不同外观
        let monsterColor;
        switch(monsterType) {
            case 0: monsterColor = 'rgba(255, 0, 0, 0.8)'; break; // 红色
            case 1: monsterColor = 'rgba(255, 165, 0, 0.8)'; break; // 橙色
            case 2: monsterColor = 'rgba(0, 0, 200, 0.8)'; break; // 蓝色
            case 3: monsterColor = 'rgba(0, 200, 0, 0.8)'; break; // 绿色
            default: monsterColor = 'rgba(255, 0, 0, 0.8)'; // 默认红色
        }
        
        // 添加怪物图标样式
        monsterEl.style.width = `${baseSize}px`;
        monsterEl.style.height = `${baseSize}px`;
        monsterEl.style.backgroundImage = 'url("static/images/enemy_icon.png")';
        monsterEl.style.backgroundSize = 'cover';
        monsterEl.style.backgroundRepeat = 'no-repeat';
        monsterEl.style.backgroundColor = 'transparent';
        monsterEl.style.border = `2px solid ${monsterColor}`;
        monsterEl.style.borderRadius = '50%'; // 确保是圆形
        monsterEl.style.boxShadow = `0 0 8px ${monsterColor}`;
        
        // 创建新标记
        const marker = new AMap.Marker({
            position: position,
            content: monsterEl,
            offset: new AMap.Pixel(-baseSize/2, -baseSize/2)
        });
        
        // 添加到地图
        window.map.add(marker);
        
        // 添加点击事件
        marker.on('click', function() {
            handleMonsterClick({
                hp: monster.hp,
                attack: monster.attack,
                defense: monster.defense,
                speed: monster.speed,
                type: monsterType, // 确保类型正确传递
                marker: marker,
                position: position
            });
        });
        
        // 更新怪物对象的标记引用
        monster.marker = marker;
    });
    
    console.log("所有怪物标记已重新创建完成");
}

// 存档相关函数
function saveGameData() {
    try {
        const gameData = {
            playerLevel,
            playerMaxHP,
            playerAttack,
            playerDefense,
            playerSpeed,
            playerCoins,
            tempStatReduction,
            monsters: monsters.map(monster => ({
                hp: monster.hp,
                attack: monster.attack,
                defense: monster.defense,
                speed: monster.speed,
                type: monster.type,
                level: monster.level,
                position: monster.position
            }))
        };
        
        localStorage.setItem('gameData', JSON.stringify(gameData));
        console.log('游戏数据已保存到本地存储');
        return true;
    } catch (error) {
        console.error('保存游戏数据失败:', error);
        return false;
    }
}

// 加载游戏数据
function loadGameData() {
    try {
        const savedData = localStorage.getItem('gameData');
        if (savedData) {
            console.log("成功读取存档数据");
            const gameData = JSON.parse(savedData);
            
            // 恢复玩家数据
            playerLevel = gameData.playerLevel;
            playerMaxHP = gameData.playerMaxHP;
            playerAttack = gameData.playerAttack;
            playerDefense = gameData.playerDefense;
            playerSpeed = gameData.playerSpeed;
            playerCoins = gameData.playerCoins;
            
            // 恢复临时属性降低状态
            if (gameData.tempStatReduction) {
                tempStatReduction = gameData.tempStatReduction;
            }
            
            // 恢复怪物数据
            monsters = gameData.monsters.map(monsterData => ({
                ...monsterData,
                marker: null // 标记会在后续重新创建
            }));
            
            // 更新玩家属性面板
            updatePlayerStatsPanel();
            
            console.log('游戏数据已从本地存储加载，玩家等级:', playerLevel, '怪物数量:', monsters.length);
            return true;
        } else {
            console.log("没有找到存档数据");
            return false;
        }
    } catch (error) {
        console.error('加载存档失败:', error);
        return false;
    }
}

// 添加自动存档功能
function setupAutoSave() {
    // 每5分钟自动保存一次
    setInterval(saveGameData, 5 * 60 * 1000);
}

// 在页面加载时设置自动存档
document.addEventListener('DOMContentLoaded', function() {
    // ... existing code ...
    
    // 设置自动存档
    setupAutoSave();
    
    // ... rest of existing code ...
});

// 多人游戏事件处理
socket.on('connect', () => {
    console.log('已连接到服务器');
    playerId = socket.id;
    
    // 发送玩家加入信息
    socket.emit('playerJoin', {
        position: playerModel ? playerModel.position : new THREE.Vector3(0, 0, 0),
        rotation: playerModel ? playerModel.rotation : new THREE.Euler(0, 0, 0),
        health: playerHP
    });
});

socket.on('playerJoined', (playerData) => {
    if (playerData.id !== playerId) {
        console.log('新玩家加入:', playerData.id);
        // 创建其他玩家的模型
        createOtherPlayerModel(playerData);
    }
});

socket.on('currentPlayers', (players) => {
    console.log('当前在线玩家:', players);
    players.forEach(playerData => {
        if (playerData.id !== playerId) {
            createOtherPlayerModel(playerData);
        }
    });
});

socket.on('playerMoved', (data) => {
    if (data.id !== playerId && otherPlayers.has(data.id)) {
        const otherPlayer = otherPlayers.get(data.id);
        // 更新其他玩家的位置和旋转
        otherPlayer.model.position.copy(data.position);
        otherPlayer.model.rotation.copy(data.rotation);
    }
});

socket.on('playerAttacked', (data) => {
    if (data.id !== playerId) {
        // 处理其他玩家的攻击效果
        const attacker = otherPlayers.get(data.id);
        if (attacker) {
            playAttackAnimation(attacker.mixer, attacker.actions);
        }
    }
});

socket.on('playerHealthUpdate', (data) => {
    if (data.id !== playerId) {
        const otherPlayer = otherPlayers.get(data.id);
        if (otherPlayer) {
            otherPlayer.health = data.health;
            // 更新其他玩家的血条
            updateOtherPlayerHealthBar(data.id, data.health);
        }
    }
});

socket.on('playerLeft', (playerId) => {
    console.log('玩家离开:', playerId);
    if (otherPlayers.has(playerId)) {
        const otherPlayer = otherPlayers.get(playerId);
        // 移除其他玩家的模型和UI
        scene.remove(otherPlayer.model);
        if (otherPlayer.healthBar) {
            otherPlayer.healthBar.remove();
        }
        otherPlayers.delete(playerId);
    }
});

// 创建其他玩家的模型
function createOtherPlayerModel(playerData) {
    const loader = new GLTFLoader();
    loader.load(
        path.join(__dirname, 'static/models/player.glb'),
        (gltf) => {
            const model = gltf.scene;
            model.position.copy(playerData.position);
            model.rotation.copy(playerData.rotation);
            model.scale.set(1, 1, 1);
            
            // 创建其他玩家的血条
            const healthBar = createHealthBar(false);
            healthBar.style.display = 'none'; // 初始隐藏血条
            
            // 存储其他玩家信息
            otherPlayers.set(playerData.id, {
                model: model,
                health: playerData.health,
                healthBar: healthBar,
                mixer: new THREE.AnimationMixer(model),
                actions: {}
            });
            
            // 设置动画
            const mixer = otherPlayers.get(playerData.id).mixer;
            const actions = otherPlayers.get(playerData.id).actions;
            gltf.animations.forEach((clip) => {
                actions[clip.name] = mixer.clipAction(clip);
            });
            
            // 播放待机动画
            playIdleAnimation(mixer, actions);
            
            scene.add(model);
        },
        undefined,
        (error) => {
            console.error('加载其他玩家模型失败:', error);
        }
    );
}

// 更新其他玩家的血条
function updateOtherPlayerHealthBar(playerId, health) {
    const otherPlayer = otherPlayers.get(playerId);
    if (otherPlayer && otherPlayer.healthBar) {
        updateHealthBar(false, health, 100); // 假设最大血量为100
    }
}

// 修改现有的移动和攻击函数，添加网络同步
function updatePlayerPosition() {
    if (playerModel && socket) {
        socket.emit('playerMove', {
            position: playerModel.position,
            rotation: playerModel.rotation
        });
    }
}

// 初始化音频的函数
function initializeAudio() {
    if (audioInitialized) return;
    
    // 播放地图背景音乐
    const mapMusic = document.getElementById('map-music');
    if (mapMusic) {
        mapMusic.currentTime = 0;
        mapMusic.volume = 0.2;
        mapMusic.play().catch(error => {
            console.log('地图音乐播放失败:', error);
        });
    }
    
    // 初始化其他音频元素
    const battleMusic = document.getElementById('battle-music');
    if (battleMusic) {
        battleMusic.volume = 0.2;
    }
    
    const explosionSound = document.getElementById('explosion-sound');
    if (explosionSound) {
        explosionSound.volume = 0.3;
    }
    
    const winSound = document.getElementById('win-sound');
    if (winSound) {
        winSound.volume = 0.3;
    }
    
    const loseSound = document.getElementById('lose-sound');
    if (loseSound) {
        loseSound.volume = 0.3;
    }
    
    const defenseSound = document.getElementById('defense-sound');
    if (defenseSound) {
        defenseSound.volume = 0.3;
    }
    
    const fireSound = document.getElementById('fire-sound');
    if (fireSound) {
        fireSound.volume = 0.3;
    }
    
    const recoverSound = document.getElementById('recover-sound');
    if (recoverSound) {
        recoverSound.volume = 0.3;
    }
    
    const runSound = document.getElementById('run-sound');
    if (runSound) {
        runSound.volume = 0.3;
    }
    
    audioInitialized = true;
}
