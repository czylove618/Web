/* 移植自 PkCal.java */
const PkCal = {
    MAX_VALUE: (Math.pow(2, 31) - 1) * 5 / 10000,

    // 回血规则 { roleId, srcAttrIndex, skillHealRate, basicHealRate }
    HEAL_RULES: [
        [16, 0, 0.1, 0],
        [3,  2, 0.6, 0.5],
        [20, 2, 0.5, 0.35]
    ],

    // ========== 实例状态 ==========
    conversionValue: null,
    storageResult: null,
    speed: 0,
    isComplete: true,
    outTxt: [],
    roleEntries: [],

    reset() {
        this.conversionValue = [];
        for (let i = 0; i < 4; i++) {
            const row = [];
            for (let j = 0; j < 4; j++) row.push(new Array(10).fill(0));
            this.conversionValue.push(row);
        }
        this.storageResult = new Map();
        this.speed = 0;
        this.isComplete = true;
        this.outTxt = [];
        this.roleEntries = [];
    },

    // ========== 主入口 ==========
    calculate(seq, roleValueStrs, roleTransformStrs) {
        this.reset();
        const baseValues = roleValueStrs.map(s => this.parseValue(s));
        const transform = this.conversionProperTransform(seq, roleTransformStrs);
        this.outTxt.push(Init.VERSION);

        try {
            this.initSeq(seq, transform, baseValues);
        } finally {
            this.printTransform();
            if (this.isComplete) {
                this.printConversionValue();
                this.printFinalResult(seq);
            }
        }
        return this.outTxt.join('\r\n');
    },

    parseValue(s) {
        const parts = s.split(/[,，]+/);
        return [Number(parts[0]), Number(parts[1]), Number(parts[2]), Number(parts[3])];
    },

    conversionProperTransform(seq, roleTransformStrs) {
        const roles = roleTransformStrs.map(s => s.split(/[,，]+/));
        const result = [].concat(...roles);
        const seqParts = seq.split(/[,，]+/);
        this.roleEntries = [];
        for (let i = 0; i < seqParts.length && i < roles.length; i++) {
            this.roleEntries.push([seqParts[i], ...roles[i]]);
        }
        this.tranformName(result);
        return result;
    },

    tranformName(result) {
        for (let i = 0; i < result.length; i++) {
            if (Init.skinIncludeMap.has(result[i])) {
                result[i] = Init.skinIncludeMap.get(result[i]);
            }
            if (result[i] === "待替换") {
                const allQian = Array.from(Init.qianYuan.keys());
                allQian.push("灵转体贰叁", "攻转体壹叁");
                const idx = Math.floor(Math.random() * allQian.length);
                result[i] = allQian[idx];
            }
        }
    },

    getNum(seq) {
        for (const [num, name] of Init.roleMap) {
            if (name === seq) return num;
        }
        return -1;
    },

    initSeq(seq, transform, baseValues) {
        const seqs = seq.split("，");
        for (let i = 0; i < seqs.length && i < 5; i++) {
            const num = this.getNum(seqs[i]);
            const off = i * 3;
            this.calRole(num, baseValues[i].slice(),
                transform[off], transform[off + 1], transform[off + 2]);
        }
    },

    calRole(roleId, persionValue, ...cons) {
        const rules = Init.roleBaseRule.get(roleId);
        if (!rules) return;     // 空角色 / 未配置角色

        for (const rule of rules) {
            const source = rule[0], sink = rule[1];
            const rate = rule[2], capped = (rule[3] === 1);
            const base = persionValue[source] + this.getSum(source);
            if (capped) {
                persionValue[sink] += this.getTrueValue(base * rate, roleId, null);
            } else {
                persionValue[sink] += base * rate;
            }
        }
        this.storageResult.set(roleId, persionValue.slice());

        for (const con of cons) {
            this.calindition(con, persionValue);
        }
    },

    calindition(con, persionValue) {
        if (con === "空点化") return;

        if (!Init.conversionMap.has(con) && !Init.qianYuan.has(con)) {
            this.outTxt.push(`===========皮肤名称“${con}”错误===========`);
            this.isComplete = false;
            return;
        }

        if (String(con).includes("乾元") && Init.qianYuan.has(con)) {
            const all = Init.qianYuan.get(con);
            this.calculationDouble(Init.conversionMap.get(all[0]), persionValue, con);
            this.calculationDouble(Init.conversionMap.get(all[1]), persionValue, con);
        } else {
            this.calculationDouble(Init.conversionMap.get(con), persionValue, con);
        }
    },

    calculationDouble(dotted, persionValue, con) {
        const source = dotted[0] - 1;
        const sink = dotted[1] - 1;
        const rate = dotted[2];
        const classify = dotted[3];
        const normal = persionValue[source] + this.getSum(source);
        let value = normal * rate;

        if (sink === 1 || sink === 2 || sink === 3) {
            value = this.getTrueValue(value, con, dotted);
        }
        if (sink === -1) {
            value = this.getTrueValue(value, con, dotted);
            this.speed = value;
        } else {
            this.conversionValue[source][sink][classify] = value;
        }
    },

    getTrueValue(persionValue, role, dotted) {
        if (persionValue > this.MAX_VALUE) {
            if (Init.maxPrint) {
                if (typeof role === 'number') {
                    console.log(`${Init.roleMap.get(role)}修炼/绝技超限，本次转换值为：${persionValue}`);
                } else if (dotted) {
                    console.log(`${role}溢出，转换为：${this.getText(dotted[0] - 1)}转${this.getText(dotted[1] - 1)}，本次转换值为：${persionValue}`);
                }
            }
            return this.MAX_VALUE;
        }
        return persionValue;
    },

    getSum(num) {
        let sum = 0;
        for (let i = 0; i < 10; i++) {
            sum += this.conversionValue[0][num][i];
            sum += this.conversionValue[1][num][i];
            sum += this.conversionValue[2][num][i];
            sum += this.conversionValue[3][num][i];
        }
        return sum;
    },

    getText(num) {
        return ["体", "攻", "灵", "防"][num] || null;
    },

    printTransform() {
        for (const entry of this.roleEntries) {
            if (!entry.length || entry[0] === "空") continue;
            let line = entry[0] + "：";
            for (let j = 1; j < entry.length; j++) line += entry[j] + " ";
            this.outTxt.push(line);
        }
    },

    printConversionValue() {
        this.outTxt.push("--------皮肤转换附加属性（单位：万）---------------------");
        this.outTxt.push("附加体：" + Math.round(this.getSum(0)));
        this.outTxt.push("附加攻：" + Math.round(this.getSum(1)));
        this.outTxt.push("附加灵：" + Math.round(this.getSum(2)));
        this.outTxt.push("附加防：" + Math.round(this.getSum(3)));
        if (this.speed > 0.0) {
            this.outTxt.push("附加速：" + Math.round(this.speed));
        }
    },

    printFinalResult(seq) {
        this.outTxt.push("----------------进场属性（单位：万）-------------------------");
        const globle = [this.getSum(0), this.getSum(1), this.getSum(2), this.getSum(3)];
        for (const role of seq.split("，")) {
            const ve2 = this.storageResult.get(this.getNum(role));
            if (!ve2) continue;
            this.outTxt.push(
                `${role} 体-${Math.round(globle[0] + ve2[0])} 攻-${Math.round(globle[1] + ve2[1])} ` +
                `灵-${Math.round(globle[2] + ve2[2])} 防-${Math.round(globle[3] + ve2[3])}`
            );
        }

        // 回血计算
        const presentRules = [];
        const presentValues = [];
        for (const rule of this.HEAL_RULES) {
            const vals = this.storageResult.get(rule[0]);
            if (vals) {
                presentRules.push(rule);
                presentValues.push(vals);
            }
        }
        if (presentRules.length === 0) {
            this.outTxt.push("");
            return;
        }
        this.outTxt.push("-------------首回合血量参考（单位：万）-------------------------");

        let skillHealSumForBasic = 0;
        let hasLingHeal = false;
        let lingHealInfo = null;

        for (let i = 0; i < presentRules.length; i++) {
            const rule = presentRules[i];
            const vals = presentValues[i];
            const roleId = rule[0];
            const src = rule[1];
            const heal = (globle[src] + vals[src]) * rule[2];
            this.outTxt.push(
                `${Init.roleMap.get(roleId)}基于${["体","攻","灵","防"][src]}回血${heal.toFixed(4)}`
            );
            if (rule[3] > 0) {
                if (lingHealInfo === null) {
                    lingHealInfo = [roleId, heal, rule[3]];
                } else {
                    hasLingHeal = true;
                }
            } else {
                skillHealSumForBasic += heal;
            }
        }

        if (lingHealInfo && !hasLingHeal) {
            const [roleId, heal, basicRate] = lingHealInfo;
            const vals = this.storageResult.get(roleId);
            const gong = (globle[0] + vals[0] + heal + skillHealSumForBasic) * basicRate;
            this.outTxt.push(`${Init.roleMap.get(roleId)}普攻回血 ${gong.toFixed(4)}`);
        }
        this.outTxt.push("");
    }
};