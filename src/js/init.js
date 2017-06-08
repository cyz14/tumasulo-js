const INQUEUE = 0;
const ISSUE = 1;
const EXE = 2;
const WB = 3;
const DONE = 4;

var Instruction = Class.extend({
    init: function(op, rd, rs, rt) {
        this.op = op;
        this.rd = rd; // target register
        this.rs = rs; // first oprand
        this.rt = rt; // second oprand
        this.status = 0;
        this.leftCycle = opCycleNumber(op);
    },
    isFP: function() {
        if (this.op == 'LD' || this.op == 'SD') {
            return false;
        }
        return true;
    },
    toString: function() {
        return this.op + ' ' + this.rd + ' ' + this.rs + ' ' + this.rt; //  + ' ' + this.leftCycle
    }
});

function opCycleNumber(op) {
    switch (op.toUpperCase()) {
        case 'LD':
            num = 2;
            break;
        case 'ST':
            num = 2;
            break;
        case 'ADDD':
            num = 2;
            break;
        case 'SUBD':
            num = 2;
            break;
        case 'MULD':
            num = 10;
            break;
        case 'DIVD':
            num = 40;
            break;
        default:
            console.log(op + ' not supported');
    }
    return num;
}

FPAdder = Class.extend({
    init: function(simu, name) {
        this.name = name;
        this.inst1 = null;
        this.inst2 = null;
        this.simu = simu;
        this.busy = 'not';
    },

    oneCycle: function() {
        this.inst2 = this.inst1;
        if (this.inst2 != null) {
            this.busy = 'exe';
            if (this.inst2.leftCycle == 1) {
                switch (this.inst2.op) {
                    case 'ADDD':
                        this.inst2.res = this.inst2.rs + this.inst2.rt;
                        break;
                    case 'SUBD':
                        this.inst2.res = this.inst2.rs - this.inst2.rt;
                        break;
                }
                this.simu.instQueue[this.inst2.index].status = EXE; // executed
            }
            this.inst2.leftCycle--;
        }

        this.inst1 = this.newInst;

        if (this.inst1)
            this.inst1.leftCycle--;
        this.newInst = null;
    },

    addInst: function(inst) {
        this.newInst = inst;
        this.busy = 'yes';
    },

    writeBack: function() {
        if (this.busy == 'exe' && this.inst2 && this.inst2.leftCycle == 0) {
            // notify
            this.simu.setCDB(this.inst2.rsNum, this.inst2.res);
            this.busy = 'not';
        }
    }
});

var Multiplier = Class.extend({
    init: function(simu, name) {
        this.simu = simu;
        this.name = name;
        this.inst = null;
        this.regs = new Array(6);
        this.busy = 'not';
    },

    oneCycle: function() {
        if (this.inst == null) {
            return;
        }

        this.inst.leftCycle--;
        if (this.inst.leftCycle == 0) {
            switch (this.inst.op) {
                case 'MULD':
                    this.inst.res = this.inst.rs * this.inst.rt;
                    break;
                case 'DIVD':
                    this.inst.res = this.inst.rs / this.inst.rt;
                    break;
                default:
                    console.log('Error');
                    break;
            }
            this.simu.instQueue[this.inst.index].status = EXE; // executed
        }
    },

    addInst: function(inst) {
        this.inst = inst;
        this.busy = 'yes';
    },

    writeBack: function() {
        if (this.busy == 'yes' && this.inst && this.inst.leftCycle == 0) {
            this.simu.setCDB(this.inst.rsNum, this.inst.res);
            this.simu.instQueue[this.inst.index].status = WB;
            this.busy = 'not';
        }
    }
});

var ReservationStation = Class.extend({
    init: function(id) {
        this.id = id;
        this.op = '';
        this.Qj = 0;
        this.Qk = 0;
        this.Vj = 0;
        this.Vk = 0;
        this.busy = 'not';
        this.A = 0;
    }
});

var Memory = Class.extend({
    init: function(simu, size) {
        this.simu = simu;
        this.size = size;
        this.mem = new Array(size);
        for (var i = 0; i < size; ++i) {
            this.mem[i] = 0;
        }
        this.loadBusy = 'not';
        this.storeBusy = 'not';
    },

    getMemAt: function(addr) {
        return this.mem[addr];
    },

    setMemAt: function(addr, data) {
        this.mem[addr] = data;
    },

    loadByResStation: function(rs) {
        this.ldCycleLeft = 2;
        this.ldRS = rs;
        this.loadBusy = 'yes';
    },

    storeByResStation: function(rs) {
        this.stRS = rs;
    },

    oneCycle: function() {
        if (this.loadBusy == 'yes') {
            if (this.ldCycleLeft == 2) {
                this.ldRS.A = this.ldRS.Vj + this.ldRS.A;
            } else if (this.ldCycleLeft == 1) {
                this.ld = this.getMemAt(this.ldRS.A);
                this.loadBusy = 'not';
            }
            this.ldCycleLeft--;
        }

        if (this.storeBusy == 'yes') {
            if (this.stCycleLeft == 2) {
                this.stRS.A = this.stRS.Vj + this.stRS.A;
            } else if (this.stCycleLeft == 1) {
                this.setMemAt(this.stRS.A, this.stRS.Vk);
                this.storeBusy = 'not';
            }
            this.stCycleLeft--;
            if (this.stCycleLeft == 0)
                this.storeBusy = 'not';
        }
    },

    writeBack: function() {
        if (this.ldCycleLeft == 0) {
            this.simu.setCDB(this.ldRS.id, this.ld);
            this.ldRS.busy = 'not';
        }
    }
});


var Simulator = Class.extend({

    init: function(loadResNum, storeResNum, adderResNum, multResNum) {
        this.instQueue = new Array();
        this.nInsts = 0;

        this.Regs = new Array(30 + 1);
        for (var i = 0; i < 31; ++i)
            this.Regs[i] = i;

        this.memory = new Memory(this, 4096);

        this.adder = new FPAdder(this, 'fpadder');

        this.multiplier = new Multiplier(this, 'multiplier');

        this.Qi = new Array(30 + 1);
        for (var i = 0; i < 31; ++i)
            this.Qi[i] = 0;

        var rsSize = loadResNum + storeResNum + adderResNum + multResNum + 5;
        this.RS = new Array(rsSize);

        this.loadStartIndex = 1;
        this.loadEndIndex = this.loadStartIndex + loadResNum;
        this.loadResNum = loadResNum;

        this.storeResNum = storeResNum;
        this.storeStartIndex = this.loadEndIndex;
        this.storeEndIndex = this.storeStartIndex + storeResNum;

        this.addStartIndex = this.storeEndIndex;
        this.addEndIndex = this.addStartIndex + adderResNum;
        this.multStartIndex = this.addEndIndex;
        this.multEndIndex = this.multStartIndex + multResNum;

        for (var i = 0; i < this.multEndIndex; ++i)
            this.RS[i] = new ReservationStation(i);

        this.cdb = ''; // common data bus
    },

    oneCycle: function() {
        var is_issued = this.issue();
        this.execute();
        this.writeBack();
    },

    issue: function() {
        if (this.nInsts < this.instQueue.length) {
            var inst = this.instQueue[this.nInsts];
            this.instQueue[this.nInsts].status = 1; // issued
            ++this.nInsts;

            if (inst.op == 'ADDD' || inst.op == 'SUBD') {
                var r = -1;
                for (var i = this.addStartIndex; i < this.addEndIndex; ++i) {
                    if (this.RS[i].busy == 'not') {
                        r = i;
                        break;
                    }
                }

                if (r != -1) { // 
                    var rs = this.parseRegister(inst.rs);
                    var rt = this.parseRegister(inst.rt);
                    var rd = this.parseRegister(inst.rd);

                    if (this.Qi[rs] != 0) { // 第一操作数没有就绪
                        this.RS[r].Qj = this.Qi[rs];
                    } else { // ready
                        this.RS[r].Vj = this.Regs[rs];
                        this.RS[r].Qj = 0;
                    }

                    if (this.Qi[rt] != 0) {
                        this.RS[r].Qk = this.Qi[rt];
                    } else { // ready
                        this.RS[r].Vk = this.Regs[rt];
                        this.RS[r].Qk = 0;
                    }

                    this.RS[r].busy = 'yes';
                    this.RS[r].op = inst.op;
                    this.Qi[rd] = r;

                    this.RS[r].index = inst.index;
                    return true;
                }
            } else if (inst.op == 'MULD' || inst.op == 'DIVD') {
                var r = -1;
                for (var i = this.multStartIndex; i < this.multEndIndex; ++i) {
                    if (this.RS[i].busy == 'not') {
                        r = i;
                        break;
                    }
                }

                if (r != -1) {
                    var rs = this.parseRegister(inst.rs);
                    var rt = this.parseRegister(inst.rt);
                    var rd = this.parseRegister(inst.rd);

                    if (this.Qi[rs] != 0) { // 第一操作数没有就绪
                        this.RS[r].Qj = this.Qi[rs];
                    } else { // ready
                        this.RS[r].Vj = this.Regs[rs];
                        this.RS[r].Qj = 0;
                    }

                    if (this.Qi[rt] != 0) {
                        this.RS[r].Qk = this.Qi[rt];
                    } else { // ready
                        this.RS[r].Vk = this.Regs[rt];
                        this.RS[r].Qk = 0;
                    }

                    this.RS[r].busy = 'yes';
                    this.RS[r].op = inst.op;
                    this.Qi[rd] = r;

                    this.RS[r].index = inst.index;
                    return true;
                }
            } else if (inst.op == 'LD') {
                var r = -1;
                for (var i = this.loadStartIndex; i < this.loadEndIndex; ++i) {
                    if (this.RS[i].busy == 'not') {
                        r = i;
                        break;
                    }
                }
                if (r != -1) {
                    var rt = this.parseRegister(inst.rd);
                    var imm = this.parseRegister(inst.rs);
                    var rs = this.parseRegister(inst.rt);

                    if (this.Qi[rs] != 0) {
                        this.RS[r].Qj = this.Qi[rs];
                    } else {
                        this.RS[r].Vj = this.Regs[rs];
                        this.RS[r].Qj = 0; // ready
                    }
                    this.RS[r].busy = 'yes';
                    this.RS[r].A = imm;
                    this.Qi[rt] = r;

                    this.RS[r].index = inst.index;
                    return true;
                }
            } else if (inst.op == 'SD') {
                var r = -1;
                for (var i = this.storeStartIndex; i < this.storeEndIndex; ++i) {
                    if (this.RS[i].busy == 'not') {
                        r = i;

                        break;
                    }
                }
                if (r != -1) {
                    var rt = this.parseRegister(inst.rd);
                    var imm = this.parseRegister(inst.rs);
                    var rs = this.parseRegister(inst.rt);

                    if (this.Qi[rs] != 0) {
                        this.RS[r].Qj = this.Qi[rs];
                    } else {
                        this.RS[r].Vj = this.Regs[rs];
                        this.RS[r].Qj = 0; // ready
                    }

                    if (this.Qi[rt] != 0) {
                        this.RS[r].Qk = this.Qi[rt];
                    } else {
                        this.RS[r].Vk = this.Regs[rt];
                        this.RS[r].Qk = 0;
                    }
                    this.RS[r].busy = 'yes';
                    this.RS[r].A = imm;

                    this.RS[r].index = inst.index;
                    return true;
                }
            }
            return false;
        }
    },

    loadFirstPos: function() {
        for (var r = this.loadStartIndex; r < this.loadEndIndex; r++) {
            if (this.RS[r].busy == 'yes')
                return r;
        }
        return -1;
    },

    storeFirstPos: function() {
        for (var r = this.storeStartIndex; r < this.storeEndIndex; r++) {
            if (this.RS[r].busy == 'yes')
                return r;
        }
        return -1;
    },

    execute: function() {

        for (var r = this.addStartIndex; r < this.addEndIndex; ++r) {
            if (this.RS[r].busy != 'yes') continue;
            if (this.RS[r].Qj == 0 && this.RS[r].Qk == 0) {
                // calculate
                this.adder.addInst({
                    rsNum: r,
                    leftCycle: opCycleNumber(this.RS[r].op),
                    index: this.RS[r].index,
                    op: this.RS[r].op,
                    rs: this.RS[r].Vj,
                    rt: this.RS[r].Vk
                });
                this.RS[r].busy = 'exe';
                break;
            }
        }


        if (this.multiplier.busy == 'not') {
            for (var r = this.multStartIndex; r < this.multEndIndex; ++r) {
                if (this.RS[r].busy == 'not') continue;
                if (this.RS[r].Qj == 0 && this.RS[r].Qk == 0) {
                    // calculate
                    this.multiplier.addInst({
                        rsNum: r,
                        leftCycle: opCycleNumber(this.RS[r].op),
                        index: this.RS[r].index,
                        op: this.RS[r].op,
                        rs: this.RS[r].Vj,
                        rt: this.RS[r].Vk
                    });
                    break;
                }
            }
        }

        var r = this.loadFirstPos();
        if (r > 0 && this.memory.loadBusy == 'not' && this.RS[r].Qj == 0) {
            this.memory.loadByResStation(this.RS[r]);
        }

        r = this.storeFirstPos();
        if (r > 0 && this.memory.storeBusy == 'not' && this.RS[r].Qj == 0) {
            this.memory.storeByResStation(this.RS[r]);
        }

        this.adder.oneCycle();
        this.multiplier.oneCycle();
        this.memory.oneCycle();
    },

    writeBack: function() {
        this.adder.writeBack();
        this.multiplier.writeBack();
        this.memory.writeBack();
    },

    setCDB: function(r, data) {
        for (var i = 0; i < 31; i++) {
            if (this.Qi[i] == r) {
                this.Regs[i] = data;
                this.Qi[i] = 0;
            }
        }

        for (var i = 0; i < this.multEndIndex; i++) {
            if (this.RS[i].Qj == r) {
                this.RS[i].Vj = data;
                this.RS[i].Qj = 0;
            }
            if (this.RS[i].Qk == r) {
                this.RS[i].Vk = data;
                this.RS[i].Qk = 0;
            }
        }

        this.RS[r].busy = 'not';
    },

    parseRegister: function(rs) {
        var res = -1;
        if (rs[0] == 'F' || rs[0] == 'R') {
            res = parseInt(rs.substr(1));
        } else {
            res = parseInt(rs);
        }
        return res;
    },

    updateView: function() {
        // update html elements
        var table = document.getElementById('float-regs');
        var r = 2;
        for (var c = 0, m = table.rows[r].cells.length; c < m; c++) {
            table.rows[r].cells[c].innerHTML = simulator.Regs[c];
        }
    }
});

var simulator = new Simulator(3, 3, 3, 2);