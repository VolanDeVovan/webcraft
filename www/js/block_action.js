import {ROTATE, Vector, VectorCollector, Helpers} from "./helpers.js";
import { AABB } from './core/AABB.js';
import {CubeSym} from './core/CubeSym.js';
import { BLOCK, FakeTBlock } from "./blocks.js";
import {ServerClient} from "./server_client.js";
import { Resources } from "./resources.js";
import {impl as alea} from '../vendors/alea.js';

const _createBlockAABB = new AABB();

const sides = [
    new Vector(1, 0, 0),
    new Vector(-1, 0, 0),
    new Vector(0, 1, 0),
    new Vector(0, -1, 0),
    new Vector(0, 0, 1),
    new Vector(0, 0, -1)
];

const rotates = [
    new Vector(13, 0, 0), // CubeSym.ROT_Z3
    new Vector(22, 0, 0), // CubeSym.ROT_Z
    new Vector(CubeSym.ROT_Y3, 0, 0),
    new Vector(CubeSym.ROT_X2, 0, 0),
    new Vector(18, 0, 0), // CubeSym.ROT_X3
    new Vector(CubeSym.ROT_X, 0, 0)
];

function calcRotateByPosN(rot, pos_n) {
    if (Math.abs(pos_n.y) === 1) {
        rot = new Vector(rot);
        rot.x = BLOCK.getCardinalDirection(rot);
        rot.z = 0;
        rot.y = pos_n.y; // mark that is up
        return rot;
    } else {
        for(let i in sides) {
            let side = sides[i];
            if(side.equal(pos_n)) {
                return rotates[i];
            }
        }
    }
    throw 'error_invalid_pos_n';

}

// Calc rotate
function calcRotate(rot, pos_n) {
    rot = new Vector(rot);
    rot.x = 0;
    rot.y = 0;
    // top normal
    if (Math.abs(pos_n.y) === 1) {
        rot.x = BLOCK.getCardinalDirection(rot);
        rot.z = 0;
        rot.y = pos_n.y; // mark that is up
    } else {
        rot.z = 0;
        if (pos_n.x !== 0) {
            rot.x = pos_n.x > 0 ? ROTATE.E : ROTATE.W;
        } else {
            rot.x = pos_n.z > 0 ? ROTATE.N : ROTATE.S;
        }
    }
    return rot;
}

// createPainting...
async function createPainting(e, world, pos) {
    const pos_n = pos.n;
    pos = new Vector(pos);
    if(pos_n.x == -1) {
        pos.z--;
    }
    if(pos_n.z == 1) {
        pos.x--;
    }
    const center_pos = new Vector(pos);
    let field = null;
    let fixed_field = null;
    if(pos_n.x) {
        field = 'z';
        fixed_field = 'x';
    } else if(pos_n.z) {
        field = 'x';
        fixed_field = 'z';
    }
    if(!field) {
        return false;
    }
    let painting_sizes = [
        // 4x4
        {
            name: '4x4',
            move: {y : 1},
            list: [
                {y: 2, f: -1}, {y: 2, f: 0}, {y: 2, f: 1}, {y: 2, f: 2},
                {y: 1, f: -1}, {y: 1, f: 0}, {y: 1, f: 1}, {y: 1, f: 2},
                {y: 0, f: -1}, {y: 0, f: 0}, {y: 0, f: 1}, {y: 0, f: 2},
                {y: -1, f: -1}, {y: -1, f: 0}, {y: -1, f: 1}, {y: -1, f: 2}
            ]
        },
        // 4x3
        {
            name: '4x3',
            move: {y : 1},
            list: [
                {y: 1, f: -1}, {y: 1, f: 0}, {y: 1, f: 1}, {y: 1, f: 2},
                {y: 0, f: -1}, {y: 0, f: 0}, {y: 0, f: 1}, {y: 0, f: 2},
                {y: -1, f: -1}, {y: -1, f: 0}, {y: -1, f: 1}, {y: -1, f: 2}
            ]
        },
        // 4x2
        {
            name: '4x2',
            move: {y : 1},
            list: [
                {y: 1, f: -1}, {y: 1, f: 0}, {y: 1, f: 1}, {y: 1, f: 2},
                {y: 0, f: -1}, {y: 0, f: 0}, {y: 0, f: 1}, {y: 0, f: 2}
            ]
        },
        // 2x2
        {
            name: '2x2',
            move: {y : 2},
            list: [
                {y: 0, f: 0}, {y: 1, f: 0},
                {y: 0, f: 1}, {y: 1, f: 1}
            ]
        },
        // 2x1
        {
            name: '2x1',
            move: {y : 1},
            list: [
                {y: 0, f: 0}, {y: 0, f: 1}
            ]
        },
        // 1x2
        {
            name: '1x2',
            move: {y : 2},
            list: [
                {y: 0, f: 0}, {y: 1, f: 0}
            ]
        },
        // 1x1
        {
            name: '1x1',
            move: {y : 1},
            list: [
                {y: 0, f: 0}
            ]
        }
    ];
    let blocks = new VectorCollector();
    let blocks_back = new VectorCollector();
    let bpos = new Vector(center_pos);
    let bpos_back = new Vector(center_pos);
    for(let item of painting_sizes) {
        item.size = item.name.split('x').map(x => parseInt(x));
        let ok = true;
        let painting_pos = null;
        for(let pp of item.list) {
            bpos.y = center_pos.y + pp.y;
            bpos[field] = center_pos[field] + pp.f;
            bpos[fixed_field] = center_pos[fixed_field];
            //
            if(item.size[0] == 1) {
                if(pos_n.x == -1) bpos.z++;
                if(pos_n.z == 1) bpos.x++;
            }
            if(!painting_pos) {
                painting_pos = new Vector(bpos);
            }
            let pb = blocks.get(bpos);
            //
            bpos_back.set(bpos.x, bpos.y, bpos.z);
            bpos_back[fixed_field] -= pos_n[fixed_field];
            let pb_back = blocks_back.get(bpos_back);
            if(!pb) {
                pb = world.getBlock(bpos);
                blocks.set(bpos, pb);
                //
                pb_back = world.getBlock(bpos_back);
                blocks_back.set(bpos_back, pb_back);
            }
            if((pb.id == 0 || pb.material.planting) && pb_back.id != 0) {
                // ok
            } else {
                ok = false;
                break;
            }
        }
        if(ok) {
            const size = item.name.split('x').map(x => parseInt(x));
            let aabb = new AABB();
            const w = 2/16;
            painting_pos.y += item.move.y;
            if(pos_n.x < 0) painting_pos.x += 1 - w;
            if(pos_n.z < 0) painting_pos.z += 1 - w;
            const second_corner = new Vector(painting_pos);
            second_corner[field] += size[0];
            second_corner[fixed_field] += w;
            second_corner.y -= size[1];
            aabb.set(painting_pos.x, second_corner.y, painting_pos.z, second_corner.x, painting_pos.y, second_corner.z);
            // Find image_name
            const paintings = await Resources.loadPainting();
            const col = paintings.sizes.get(item.name);
            const keys = Array.from(col.keys());
            const random = new alea(e.id);
            const image_name = keys[Math.floor(random.double() * keys.length)];
            //
            return {
                entity_id:  randomUUID(),
                aabb:       aabb.toArray(),
                size:       size,
                image_name: image_name,
                pos:        center_pos,
                pos_n:      pos_n
            };
            break;
        }
    }
    return null;
}

//
function makeDropItem(block, item) {
    if(block.hasTag('bee_nest')) {
        item.extra_data = JSON.parse(JSON.stringify(block.extra_data));
        item.entity_id = block.entity_id || randomUUID();
        item.count = 1;
    }
    return item;
}

// Drop block
function dropBlock(player, block, actions, force) {
    /*const isSurvival = true; // player.game_mode.isSurvival()
    if(!isSurvival) {
        return;
    }*/
    if(block.material.tags.indexOf('no_drop') >= 0) {
        return;
    }
    if(block.material.drop_item) {
        const drop_block = BLOCK.fromName(block.material.drop_item?.name);
        if(drop_block) {
            if('chance' in block.material.drop_item) {
                let count = block.material.drop_item.count;
                if(count) {
                    if(Math.random() <= block.material.drop_item.chance) {
                        if(Array.isArray(count)) {
                            // const rnd = (Math.random() * (max-min + 1) + min) | 0;
                            let count_index = (Math.random() * count.length) | 0;
                            count = count[count_index];
                        }
                        count = parseInt(count);
                        if(count > 0) {
                            const item = makeDropItem(block, {id: drop_block.id, count: count});
                            actions.addDropItem({pos: block.posworld.add(new Vector(.5, 0, .5)), items: [item], force: !!force});
                        }
                    }
                }
            }
        } else {
            console.error('error_invalid_drop_item', block.material.drop_item);
        }
    } else {
        const items = [];
        // check if seeds
        if(block.material.seeds) {
            let result = null;
            if(block.extra_data.complete) {
                result = block.material.seeds.result?.complete;
            } else {
                result = block.material.seeds.result?.incomplete;
            }
            if(result) {
                for(let r of result) {
                    const count = Helpers.getRandomInt(r.count.min, r.count.max);
                    if(count > 0) {
                        const result_block = BLOCK.fromName(r.name.toUpperCase());
                        if(!result_block || result_block.id < 0) {
                            throw 'error_invalid_result_block|' + r.name;
                        }
                        items.push(makeDropItem(block, {id: result_block.id, count: count}));
                    }
                }
            }
        // default drop item
        } else if(block.material.spawnable) {
            items.push(makeDropItem(block, {id: block.id, count: 1}));
        }
        for(let item of items) {
            actions.addDropItem({pos: block.posworld.add(new Vector(.5, 0, .5)), items: [item], force: !!force});
        }
    }
}

// DestroyBlocks
class DestroyBlocks {

    constructor(world, player, actions) {
        this.cv         = new VectorCollector();
        this.world      = world;
        this.player     = player;
        this.actions    = actions;
    }

    //
    add(block, pos, no_drop = false) {
        const cv        = this.cv;
        const world     = this.world;
        const player    = this.player;
        const actions   = this.actions;
        if(cv.has(block.posworld)) {
            return false;
        }
        cv.add(block.posworld, true);
        actions.addBlocks([{pos: block.posworld, item: {id: BLOCK.AIR.id}, destroy_block_id: block.id, action_id: ServerClient.BLOCK_ACTION_DESTROY}]);
        //
        if(block.material.sound) {
            actions.addPlaySound({tag: block.material.sound, action: 'dig', pos: new Vector(pos), except_players: [player.session.user_id]});
        }
        //
        if(block.material.is_jukebox) {
            // If disc exists inside jukebox
            if(block.extra_data && block.extra_data.disc) {
                const disc_id = block.extra_data.disc.id;
                // Drop disc
                dropBlock(player, new FakeTBlock(disc_id, null, block.posworld.clone(), null, null, null, null, null, null), actions, false);
                // Stop play disc
                actions.stop_disc.push({pos: block.posworld.clone()});
            }
        }
        // Drop block if need
        if(!no_drop) {
            dropBlock(player, block, actions, false);
        }
        // Destroy connected blocks
        for(let cn of ['next_part', 'previous_part']) {
            let part = block.material[cn];
            if(part) {
                const connected_pos = block.posworld.add(part.offset_pos);
                if(!cv.has(connected_pos)) {
                    let block_connected = world.getBlock(connected_pos);
                    if(block_connected.id == part.id) {
                        this.add(block_connected, pos);
                    }
                }
            }
        }
        // Удаляем второй блок кровати
        if(block.material.tags.indexOf('bed') >= 0) {
            const connected_pos = new Vector(pos).addByCardinalDirectionSelf(new Vector(0, 0, 1), block.rotate.x + 2);
            let block_connected = world.getBlock(connected_pos);
            this.add(block_connected, connected_pos, true);
        }
        // Destroy chain blocks to down
        if(block.material.destroy_to_down) {
            let npos = block.posworld.add(Vector.YN);
            let nblock = world.getBlock(npos);
            if(nblock && block.material.destroy_to_down.indexOf(nblock.material.name) >= 0) {
                this.add(nblock, pos);
            }
        }
    }

}

// PickatActions
export class PickatActions {

    #world;

    constructor(id, world, ignore_check_air = false, on_block_set = true) {
        this.#world = world;
        //
        Object.assign(this, {
            id:                         id,
            error:                      null,
            chat_message:               null,
            create_chest:               null,
            load_chest:                 null,
            open_window:                null,
            put_in_backet:              null,
            clone_block:                false,
            reset_target_pos:           false,
            reset_target_event:         false,
            decrement:                  false,
            decrement_extended:         null,
            decrement_instrument:       false,
            ignore_creative_game_mode:  false,
            sitting:                    false,
            blocks: {
                list: [],
                options: {
                    ignore_check_air: ignore_check_air,
                    on_block_set: on_block_set
                }
            },
            play_sound:             [],
            stop_disc:              [],
            drop_items:             [],
            explosion_particles:    []
        });
    }

    // Add play sound
    addPlaySound(item) {
        this.play_sound.push(item);
    }

    // Add block
    addBlocks(items) {
        for(let i = 0; i < items.length; i++) {
            const item = items[i];
            /*if(!item.item.extra_data && item.item.id > 0) {
                const extra_data = BLOCK.makeExtraData(item.item, item.pos);
                if(extra_data) {
                    throw 'error_empty_extra_data';
                    // item.item.extra_data = extra_data;
                }
            }*/
            if(item.pos.x != Math.floor(item.pos.x)) throw 'error_invalid_block_pos';
            if(item.pos.y != Math.floor(item.pos.y)) throw 'error_invalid_block_pos';
            if(item.pos.z != Math.floor(item.pos.z)) throw 'error_invalid_block_pos';
        }
        this.blocks.list.push(...items);
    }

    // Add drop item
    addDropItem(item) {
        this.drop_items.push(item);
    }

    //
    addExplosionParticles(items) {
        this.explosion_particles.push(...items);
    }

    //
    putInBucket(item) {
        if(this.put_in_backet) {
            throw 'error_put_already';
        }
        this.put_in_backet = item;
    }

    makeExplosion(vec_center, rad, add_particles, drop_blocks_chance, power) {
        const world = this.#world;
        const air = { id: 0 };
        const out_rad = Math.ceil(rad);
        const block_pos = new Vector();
        const extruded_blocks = new VectorCollector();
        drop_blocks_chance = parseFloat(drop_blocks_chance);
        //
        const createAutoDrop = (tblock) => {
            const mat = tblock.material;
            if(!mat.can_auto_drop) {
                return false;
            }
            if(!mat.is_chest && !Number.isNaN(drop_blocks_chance) && Math.random() > drop_blocks_chance) {
                return false;
            }
            const pos = tblock.posworld.clone().addSelf(new Vector(.5, .5, .5));
            extruded_blocks.set(pos, 'drop');
            // drop
            this.addDropItem({
                force: true,
                pos: pos,
                items: [
                    // @todo need to calculate drop item ID and count
                    { id: mat.id, count: 1 }
                ]
            });
            if(mat.is_chest && tblock.extra_data?.slots) {
                for(let i in tblock.extra_data.slots) {
                    const slot_item = tblock.extra_data.slots[i];
                    if(slot_item) {
                        this.addDropItem({
                            force: true,
                            pos: pos,
                            items: [
                                // @todo need to calculate drop item ID and count
                                slot_item
                            ]
                        });
                    }
                }
            }
            return true;
        };
        // const block_pos_floored = vec_center.clone().flooredSelf();
        for (let i = -out_rad; i <= out_rad; i++) {
            for (let j = -out_rad; j <= out_rad; j++) {
                for (let k = -out_rad; k <= out_rad; k++) {
                    block_pos.copyFrom(vec_center).addScalarSelf(i, k, j);
                    const dist = block_pos.distance(vec_center);
                    block_pos.flooredSelf();
                    if (dist <= rad) {
                        const tblock = world.getBlock(block_pos);
                        if(tblock) {
                            const mat = tblock.material;
                            if(mat.id > 0 && mat.material.mining.blast_resistance <= power) {
                                this.addBlocks([
                                    {pos: block_pos.clone(), item: air, drop_blocks_chance}
                                ]);
                                extruded_blocks.set(block_pos, 'extruded');
                                createAutoDrop(tblock);
                            }
                        }
                    }
                }
            }
        }
        //
        for(let [vec, _] of extruded_blocks.entries()) {
            // 1. check under
            const check_under_poses = [
                vec.clone().addSelf(new Vector(0, 1, 0)),
                vec.clone().addSelf(new Vector(0, 2, 0))
            ];
            for(let i = 0; i < check_under_poses.length; i++) {
                const pos_under = check_under_poses[i];
                if(extruded_blocks.has(pos_under)) {
                    continue;
                }
                const tblock = world.getBlock(pos_under);
                if(!tblock) {
                    continue;
                }
                createAutoDrop(tblock);
            }
        }
        //
        if(add_particles) {
            this.addExplosionParticles([{pos: vec_center.clone()}]);
        }
    }

    setSitting(pos, rotate) {
        this.sitting = {pos, rotate};
        this.addPlaySound({tag: 'madcraft:block.cloth', action: 'hit', pos: new Vector(pos), except_players: [/*player.session.user_id*/]});
    }

}

// Called to perform an action based on the player's block selection and input.
export async function doBlockAction(e, world, player, current_inventory_item) {

    const actions = new PickatActions(e.id);
    const destroyBlocks = new DestroyBlocks(world, player, actions);

    if(e.pos == false) {
        return actions;
    }

    let pos                 = e.pos;
    let world_block         = world.getBlock(pos);
    let world_material      = world_block && world_block.id > 0 ? world_block.material : null;
    let extra_data          = world_block ? world_block.extra_data : null;
    let rotate              = world_block ? world_block.rotate : null;

    // Check world block material
    if(!world_material && (e.cloneBlock || e.createBlock)) {
        console.log('error_empty_world_material', world_block.id, pos);
        return actions;
    }

    // 1. Change extra data
    if(e.changeExtraData) {
        for(let func of [editSign]) {
            if(await func(e, world, pos, player, world_block, world_material, null, current_inventory_item, world_block.extra_data, rotate, null, actions)) {
                return actions;
            }
        }
    }

    // 2. Destroy
    if(e.destroyBlock) {
        const NO_DESTRUCTABLE_BLOCKS = [BLOCK.BEDROCK.id, BLOCK.STILL_WATER.id];
        let can_destroy = true;
        if(world_block.extra_data && 'can_destroy' in world_block.extra_data) {
            can_destroy = world_block.extra_data.can_destroy;
        }
        if(can_destroy) {
            // 1. Проверка выполняемых действий с блоками в мире
            for(let func of [removeFromPot]) {
                if(await func(e, world, pos, player, world_block, world_material, null, current_inventory_item, extra_data, rotate, null, actions)) {
                    return actions;
                }
            }
            // 2.
            if(!world_material || NO_DESTRUCTABLE_BLOCKS.indexOf(world_material.id) < 0) {
                const block = world.getBlock(pos);
                if(block.id >= 0) {
                    destroyBlocks.add(block, pos);
                    //
                    actions.decrement_instrument = {id: block.id};
                    if(!block.material.destroy_to_down) {
                        // Destroyed block
                        pos = new Vector(pos);
                        // destroy plants over this block
                        let block_over = world.getBlock(pos.add(Vector.YP));
                        if(BLOCK.isPlants(block_over.id)) {
                            destroyBlocks.add(block_over, pos);
                        }
                    }
                }
            }
        }
        return actions;
    }

    // 3. Clone
    if(e.cloneBlock) {
        if(world_material && e.number == 1) {
            actions.clone_block = e.pos;
        }
        return actions;
    }

    // 4. Create
    if(e.createBlock) {

        const optimizePushedItem = (item) => {
            if('extra_data' in item && !item.extra_data) {
                delete(item.extra_data);
            }
            if('rotate' in item) {
                const block = BLOCK.fromId(item.id);
                if(!block.can_rotate) {
                    delete(item.rotate);
                }
            }
        };
    
        const pushBlock = (params) => {
            optimizePushedItem(params.item);
            actions.addBlocks([params]);
            const block = BLOCK.fromId(params.item.id);
            if(block.next_part) {
                // Если этот блок имеет "пару"
                const next_params = JSON.parse(JSON.stringify(params));
                next_params.item.id = block.next_part.id;
                optimizePushedItem(next_params.item);
                next_params.pos = new Vector(next_params.pos).add(block.next_part.offset_pos);
                pushBlock(next_params);
            }
        };
    
        // Получаем материал выбранного блока в инвентаре
        let mat_block = current_inventory_item ? BLOCK.fromId(current_inventory_item.id) : null;
        if(mat_block && mat_block.item?.emit_on_set) {
            // bucket etc.
            mat_block = BLOCK.fromName(mat_block.item.emit_on_set);
        }
        if(mat_block && mat_block.deprecated) {
            return actions;
        }

        // 1. Проверка выполняемых действий с блоками в мире
        for(let func of [putIntoPot, needOpenWindow, ejectJukeboxDisc, pressToButton, fuseTNT, sitDown, goToBed, openDoor, eatCake]) {
            if(await func(e, world, pos, player, world_block, world_material, mat_block, current_inventory_item, extra_data, rotate, null, actions)) {
                return actions;
            }
        }

        // Дальше идут действия, которые обязательно требуют, чтобы в инвентаре что-то было выбрано
        if(!current_inventory_item || current_inventory_item.count < 1) {
            return actions;
        }

        // 2. Проверка выполняемых действий с блоками в мире
        for(let func of [putDiscIntoJukebox, dropEgg, putInBucket, noSetOnTop]) {
            if(await func(e, world, pos, player, world_block, world_material, mat_block, current_inventory_item, extra_data, rotate, null, actions)) {
                return actions;
            }
        }

        // rotate_by_pos_n
        let orientation = null;
        if(mat_block.tags.indexOf('rotate_by_pos_n') >= 0) {
            orientation = calcRotateByPosN(player.rotate, pos.n);
            if(mat_block.tags.indexOf('rotate_by_pos_n_plus') >= 0) {
                if(orientation.x < 0) orientation.x *= -1;
                if(orientation.y < 0) orientation.y *= -1;
                if(orientation.z < 0) orientation.z *= -1;
                // 7+18; 13+22
                if(orientation.x == 18) orientation.x = 7;
                if(orientation.x == 22) orientation.x = 13;
            }
        } else {
            orientation = calcRotate(player.rotate, pos.n);
        }

        // 5.
        const replaceBlock = world_material && BLOCK.canReplace(world_material.id, world_block.extra_data, current_inventory_item.id);
        if(replaceBlock) {
            if(world_material.previous_part || world_material.next_part || current_inventory_item.style == 'ladder') {
                return actions;
            }
            pos.n.x = 0;
            pos.n.y = 1;
            pos.n.z = 0;
            orientation = calcRotateByPosN(player.rotate, pos.n);
        } else {
            if(await increaseLayering(e, world, pos, player, world_block, world_material, mat_block, current_inventory_item, extra_data, rotate, null, actions)) {
                return actions;
            }
            pos.x += pos.n.x;
            pos.y += pos.n.y;
            pos.z += pos.n.z;
            const block_on_posn = world.getBlock(pos);
            // Запрет установки блока, если на позиции уже есть другой блок
            if(!block_on_posn.canReplace()) {
                return actions;
            }
        }

        // 6. Запрет установки блока на блоки, которые занимает игрок
        if(!mat_block.passable > 0) {
            _createBlockAABB.set(pos.x, pos.y, pos.z, pos.x + 1, pos.y + 1, pos.z + 1);
            if(_createBlockAABB.intersect({
                x_min: player.pos.x - player.radius / 2,
                x_max: player.pos.x - player.radius / 2 + player.radius,
                y_min: player.pos.y,
                y_max: player.pos.y + player.height,
                z_min: player.pos.z - player.radius / 2,
                z_max: player.pos.z - player.radius / 2 + player.radius
            })) {
                return actions;
            }
        }

        // 7. Проверка места, куда игрок пытается установить блок(и)
        let new_pos = new Vector(pos);
        const check_poses = [new_pos];
        // Если этот блок имеет "пару"
        if(mat_block.next_part) {
            let offset = mat_block.next_part.offset_pos;
            let next = BLOCK.fromId(mat_block.next_part.id);
            while(next) {
                new_pos = new_pos.add(offset);
                check_poses.push(new_pos);
                if(next.next_part) {
                    offset = next.next_part.offset_pos;
                    next = BLOCK.fromId(next.next_part.id);
                } else {
                    next = null;
                }
            }
        }

        // Если этот блок кровать
        const pushed_blocks = [];
        if(mat_block.tags.indexOf('bed') >= 0) {
            const new_rotate = orientation.add(new Vector(2, 0, 0));
            new_rotate.x %= 4;
            const next_block = {
                pos: new_pos.clone().addByCardinalDirectionSelf(new Vector(0, 0, 1), orientation.x + 2),
                item: {
                    id: mat_block.id,
                    rotate: new_rotate,
                    extra_data: {is_head: true}
                },
                action_id: ServerClient.BLOCK_ACTION_CREATE
            };
            pushed_blocks.push(next_block);
            check_poses.push(next_block.pos);
        }

        // Проверяем, что все блоки можем установить
        for(let cp of check_poses) {
            const cp_block = world.getBlock(cp);
            if(!BLOCK.canReplace(cp_block.id, cp_block.extra_data, mat_block.id)) {
                actions.error = 'error_block_cannot_be_replace';
                return actions;
            }
        }

        // 8. Некоторые блоки можно ставить только на что-то сверху
        if(!!mat_block.is_layering && !mat_block.layering.slab && pos.n.y != 1) {
            return actions;
        }

        // 9. Некоторые блоки можно только подвешивать только на потолок
        if(mat_block.tags.indexOf('place_only_to_ceil') >= 0 && pos.n.y != -1) {
            return actions;
        }

        // 11. Запрет на списание инструментов как блоков
        if(mat_block.item) {
            // Use intruments
            for(let func of [useShovel, useHoe]) {
                if(await func(e, world, pos, player, world_block, world_material, mat_block, current_inventory_item, extra_data, rotate, replaceBlock, actions)) {
                    return actions;
                }
            }
        } else {
            // Create block
            const new_item = {
                id: mat_block.id
            };
            for(const prop of ['entity_id', 'extra_data', 'power', 'rotate']) {
                if(prop in current_inventory_item) {
                    new_item[prop] = current_inventory_item[prop];
                }
            }
            new_item.rotate = orientation;
            new_item.extra_data = new_item.extra_data || BLOCK.makeExtraData(mat_block, pos, orientation, world);
            // If painting
            if(mat_block.id == BLOCK.PAINTING.id) {
                new_item.extra_data = await createPainting(e, world, pos);
            }
            // Ограничения материалов
            for(let func of [restrictPlanting, restrictOnlyFullFace, restrictLadder, restrictTorch]) {
                if(await func(e, world, pos, player, world_block, world_material, mat_block, current_inventory_item, extra_data, rotate, replaceBlock, actions)) {
                    return actions;
                }
            }
            // Auto open edit window if sign
            if(mat_block.tags.indexOf('sign') >= 0) {
                if(orientation.y != 0) {
                    orientation.x = player.rotate.z / 90;
                }
                actions.open_window = {
                    id: 'frmEditSign',
                    args: {pos: new Vector(pos)}
                };
            }
            /*
            // Destroy connected part when replace
            if(replaceBlock && world_material.next_part) {
                const part = world_material.next_part;
                if(part) {
                    const connected_pos = new Vector(pos).add(part.offset_pos);
                    const block_connected = world.getBlock(connected_pos);
                    if(block_connected.id == part.id) {
                        destroyBlocks.add(block_connected, pos);
                    }
                }
            }
            */
            pushed_blocks.push({pos: new Vector(pos), item: new_item, action_id: ServerClient.BLOCK_ACTION_CREATE});
            for(let pb of pushed_blocks) {
                pushBlock(pb);
            }
            if(mat_block.sound) {
                actions.addPlaySound({tag: mat_block.sound, action: 'place', pos: new Vector(pos), except_players: [player.session.user_id]});
            }
            actions.decrement = true;
            actions.ignore_creative_game_mode = !!current_inventory_item.entity_id;
        }
        return actions;
    }

}

// Если ткнули на предмет с собственным окном
async function needOpenWindow(e, world, pos, player, world_block, world_material, mat_block, current_inventory_item, extra_data, rotate, replace_block, actions) {
    if(!world_material.has_window || e.shiftKey) {
        return false;
    }
    // if is chest
    if(world_material.is_chest) {
        const entity_id = world_block ? world_block.entity_id : null;
        actions.load_chest = {
            block_id:   world_material.id,
            window:     world_material.window,
            pos:        new Vector(pos),
            entity_id:  entity_id
        };
    } else {
        switch(world_material.id) {
            case BLOCK.CRAFTING_TABLE.id: {
                actions.open_window = world_material.window;
                break;
            }
            case BLOCK.FURNACE.id: {
                actions.open_window = world_material.window;
                break;
            }
            case BLOCK.CHARGING_STATION.id: {
                actions.open_window = world_material.window;
                break;
            }
        }
    }
    actions.reset_target_event = true;
    return true;
}

// Put into pot
async function putIntoPot(e, world, pos, player, world_block, world_material, mat_block, current_inventory_item, extra_data, rotate, replace_block, actions) {
    const item_frame = world_material && world_material.tags.indexOf('item_frame') >= 0;
    extra_data = extra_data ? extra_data : {};
    // rotate item in frame
    if(item_frame && extra_data?.item) {
        if(!('rot' in extra_data)) {
            extra_data.rot = 0;
        }
        extra_data.rot = (extra_data.rot + 1) % 8;
        actions.addBlocks([{pos: new Vector(pos), item: {id: world_block.id, rotate: rotate, extra_data: extra_data}, action_id: ServerClient.BLOCK_ACTION_MODIFY}]);
        actions.addPlaySound({tag: 'madcraft:block.cloth', action: 'hit', pos: new Vector(pos), except_players: [player.session.user_id]});
        return true;
    }
    //
    const putIntoPot = !e.shiftKey && world_material &&
                        (world_material.tags.indexOf('pot') >= 0) &&
                        (
                            item_frame ||
                            mat_block.planting ||
                            [BLOCK.CACTUS.id].indexOf(mat_block.id) >= 0 ||
                            mat_block.tags.indexOf('can_put_info_pot') >= 0
                        );
    if(!putIntoPot) {
        return false;
    }
    extra_data.item = {
        id: current_inventory_item.id
    };
    // copy item fields
    for(let field of ['extra_data', 'entity_id', 'power']) {
        const field_value = current_inventory_item[field];
        if(field_value) {
            extra_data.item[field] = field_value;
        }    
    }
    extra_data.rot = 0;
    actions.addBlocks([{pos: new Vector(pos), item: {id: world_block.id, rotate: rotate, extra_data: extra_data}, action_id: ServerClient.BLOCK_ACTION_MODIFY}]);
    actions.decrement_extended = {
        mode: 'count',
        ignore_creative_game_mode: true
    };
    actions.addPlaySound({tag: 'madcraft:block.cloth', action: 'hit', pos: new Vector(pos), except_players: [player.session.user_id]});
    return true;
}

// Put disc into Jukebox
async function putDiscIntoJukebox(e, world, pos, player, world_block, world_material, mat_block, current_inventory_item, extra_data, rotate, replace_block, actions) {        
    if(mat_block.item && mat_block.item && mat_block.item.name == 'music_disc') {
        if(!e.shiftKey && world_material.tags.indexOf('jukebox') >= 0) {
            const discs = await Resources.loadMusicDiscs();
            for(let disc of discs) {
                if(disc.id == mat_block.id) {
                    extra_data = {
                        disc: {...disc},
                        dt: +new Date()
                    }
                    actions.addBlocks([{
                        pos: new Vector(pos),
                        item: {id: world_material.id, rotate: rotate, extra_data: extra_data},
                        action_id: ServerClient.BLOCK_ACTION_MODIFY
                    }]);
                    actions.decrement = true;
                }
            }
        }
        return true;
    }
    return false;
}

// Drop egg
async function dropEgg(e, world, pos, player, world_block, world_material, mat_block, current_inventory_item, extra_data, rotate, replace_block, actions) {
    if(!BLOCK.isEgg(mat_block.id)) {
        return false;
    }
    pos.x += pos.n.x + .5
    pos.y += pos.n.y;
    pos.z += pos.n.z + .5;
    actions.chat_message = {text: `/spawnmob ${pos.x} ${pos.y} ${pos.z} ${mat_block.spawn_egg.type} ${mat_block.spawn_egg.skin}`};
    actions.decrement = true;
    return true;
}

// Put in bucket
async function putInBucket(e, world, pos, player, world_block, world_material, mat_block, current_inventory_item, extra_data, rotate, replace_block, actions) {
    if(!mat_block || mat_block.id != BLOCK.BUCKET_EMPTY.id) {
        return false;
    }
    let added_to_bucket = false;
    if(world_material.put_in_bucket) {
        // get filled bucket
        const filled_bucket = BLOCK.fromName(world_material.put_in_bucket);
        if(filled_bucket) {
            const item = {
                id: filled_bucket.id,
                count: 1
            };
            if(world_material.extra_data) {
                item.extra_data = world_material.extra_data;
            }
            // put in bucket
            actions.putInBucket(item);
            // destroy world block
            actions.addBlocks([{pos: new Vector(pos), item: {id: BLOCK.AIR.id}, destroy_block_id: world_material.id, action_id: ServerClient.BLOCK_ACTION_DESTROY}]);
            added_to_bucket = true;
        }
    }
    // if has sound
    if(added_to_bucket && world_material.sound) {
        actions.addPlaySound({tag: world_material.sound, action: 'place', pos: new Vector(pos), except_players: [player.session.user_id]});
    }
    return added_to_bucket;
}

// Eject disc from Jukebox
async function ejectJukeboxDisc(e, world, pos, player, world_block, world_material, mat_block, current_inventory_item, extra_data, rotate, replace_block, actions) {
    if(e.shiftKey || !world_material.is_jukebox) {
        return false;
    }
    if(!extra_data || !('disc' in extra_data)) {
        return false;
    }
    const disc_id = extra_data.disc.id;
    pos = new Vector(pos);
    // Drop disc
    dropBlock(player, new FakeTBlock(disc_id, null, new Vector(pos), null, null, null, null, null, null), actions, false);
    actions.addBlocks([{pos: pos.clone(), item: {id: world_material.id, rotate: rotate, extra_data: null}, action_id: ServerClient.BLOCK_ACTION_MODIFY}]);
    actions.stop_disc.push({pos: pos.clone()});
    return true;
}

// Press to button
async function pressToButton(e, world, pos, player, world_block, world_material, mat_block, current_inventory_item, extra_data, rotate, replace_block, actions) {
    // Buttons
    if(e.shiftKey || !world_material.is_button) {
        return false;
    }
    extra_data = extra_data || {}
    extra_data.pressed = !extra_data.pressed ? 1 : 0;
    if(extra_data && 'pressed' in extra_data) {
        pos = new Vector(pos);
        actions.addBlocks([{pos: pos, item: {id: world_material.id, rotate: rotate, extra_data: extra_data}, action_id: ServerClient.BLOCK_ACTION_MODIFY}]);
        actions.addPlaySound({tag: 'madcraft:block.player', action: 'click', pos: new Vector(pos), except_players: [player.session.user_id]});
        actions.reset_target_pos = true;
        return true;
    }
    return false;
}

// Fuse TNT
async function fuseTNT(e, world, pos, player, world_block, world_material, mat_block, current_inventory_item, extra_data, rotate, replace_block, actions) {
    if(e.shiftKey || world_material.name != 'TNT') {
        return false;
    }
    actions.addPlaySound({tag: 'madcraft:block.player', action: 'fuse', pos: new Vector(pos), except_players: [player.session.user_id]});
    // @todo make explosion like a creeper
    return true;
}

// Sit down
async function sitDown(e, world, pos, player, world_block, world_material, mat_block, current_inventory_item, extra_data, rotate, replace_block, actions) {
    const world_block_is_slab = world_material.layering && world_material.height == 0.5;
    const block_for_sittings = (world_material.tags.indexOf('stairs') >= 0) || world_block_is_slab;
    if(!block_for_sittings || mat_block) {
        return false;
    }
    // check over block if not empty for head
    const overBlock = world.getBlock(new Vector(pos.x, pos.y + 1, pos.z));
    if(!overBlock || overBlock.id == 0) {
        const obj_pos = new Vector(pos.x, pos.y, pos.z)
        if(world_block_is_slab) {
            const on_ceil = world_block.extra_data?.point?.y >= .5;
            obj_pos.addScalarSelf(.5, on_ceil ? .5 : 0, .5);
        } else {
            obj_pos.addScalarSelf(.5, 0, .5);
        }
        const dist = player.pos.distance(obj_pos);
        if(dist < 3.0) {
            actions.reset_target_pos = true;
            actions.setSitting(
                obj_pos.addScalarSelf(0, .5, 0),
                new Vector(0, 0, rotate ? (rotate.x / 4) * -(2 * Math.PI) : 0)
            )
            return true;
        }
    }
    return false;
}

// Нельзя ничего ставить поверх этого блока
async function noSetOnTop(e, world, pos, player, world_block, world_material, mat_block, current_inventory_item, extra_data, rotate, replace_block, actions) {
    const noSetOnTop = world_material.tags.indexOf('no_set_on_top') >= 0;
    return noSetOnTop && pos.n.y == 1;
}

// Edit sign
async function editSign(e, world, pos, player, world_block, world_material, mat_block, current_inventory_item, extra_data, rotate, replace_block, actions) {
    const isEditSign = e.changeExtraData && world_material && world_material.tags.indexOf('sign') >= 0;
    if(!isEditSign) {
        return false;
    }
    if(e?.extra_data?.text) {
        if(!extra_data) {
            extra_data = {
                text: null
            };
        }
        extra_data.text = e?.extra_data?.text || '';
        if(typeof extra_data.text == 'string') {
            if(extra_data.text.length <= 110) {
                var date = new Date();
                extra_data.username = player.username;
                extra_data.dt = date.toISOString();
                actions.addBlocks([{pos: new Vector(pos), item: {id: world_material.id, rotate: rotate, extra_data: extra_data}, action_id: ServerClient.BLOCK_ACTION_MODIFY}]);
            }
        }
    }
    return true;
}

// Go to bed
async function goToBed(e, world, pos, player, world_block, world_material, mat_block, current_inventory_item, extra_data, rotate, replace_block, actions) {
    const goToBed = !e.shiftKey && world_material && (world_material.tags.indexOf('bed') >= 0);
    if(!goToBed) {
        return false;
    }
    actions.error = 'error_no_time_to_sleep';
    return true;
}

// Eat cake
function eatCake(e, world, pos, player, world_block, world_material, mat_block, current_inventory_item, extra_data, rotate, replace_block, actions) {
    const eatCake = !e.shiftKey && world_material && (world_material.tags.indexOf('cake') >= 0);
    if(!eatCake) {
        return false;
    }
    if(!extra_data || typeof extra_data.pieces == 'undefined') {
        extra_data = {...world_material.extra_data};
    }
    if(extra_data?.pieces) {
        extra_data.pieces--;
        if(extra_data.pieces == 0) {
            actions.addBlocks([{pos: new Vector(pos), item: {id: BLOCK.AIR.id}, destroy_block_id: world_material.id, action_id: ServerClient.BLOCK_ACTION_DESTROY}]);
            actions.addPlaySound({tag: 'madcraft:block.player', action: 'burp', pos: new Vector(pos), except_players: [player.session.user_id]});
        } else {
            actions.addBlocks([{pos: new Vector(pos), item: {id: world_material.id, rotate: rotate, extra_data: extra_data}, action_id: ServerClient.BLOCK_ACTION_MODIFY}]);
            actions.reset_target_pos = true;
            actions.addPlaySound({tag: 'madcraft:block.player', action: 'eat', pos: new Vector(pos), except_players: [player.session.user_id]});
        }
    }
    return true;
}

// Open door
async function openDoor(e, world, pos, player, world_block, world_material, mat_block, current_inventory_item, extra_data, rotate, replace_block, actions) {
    const isEditDoor = !e.shiftKey && world_material &&
        (world_material.tags.indexOf('trapdoor') >= 0 || world_material.tags.indexOf('door') >= 0);
    if(!isEditDoor) {
        return false;
    }
    // Trapdoor
    if(!extra_data) {
        extra_data = {
            opened: false,
            point: new Vector(0, 0, 0)
        };
    }
    extra_data.opened = extra_data && !extra_data.opened;
    if(world_material.sound) {
        actions.addPlaySound({tag: world_material.sound, action: 'open', pos: new Vector(pos), except_players: [player.session.user_id]});
    }
    actions.reset_target_pos = true;
    actions.addBlocks([{pos: new Vector(pos), item: {id: world_material.id, rotate: rotate, extra_data: extra_data}, action_id: ServerClient.BLOCK_ACTION_MODIFY}]);
    // Если блок имеет пару (двери)
    for(let cn of ['next_part', 'previous_part']) {
        let part = world_material[cn];
        if(part) {
            let connected_pos = new Vector(pos).add(part.offset_pos);
            let block_connected = world.getBlock(connected_pos);
            if(block_connected.id == part.id) {
                actions.addBlocks([{pos: connected_pos, item: {id: block_connected.id, rotate: rotate, extra_data: extra_data}, action_id: ServerClient.BLOCK_ACTION_MODIFY}]);
            }
        }
    }
    return true;
}

// Remove plant from pot
async function removeFromPot(e, world, pos, player, world_block, world_material, mat_block, current_inventory_item, extra_data, rotate, replace_block, actions) {
    if(world_material && world_material.tags.indexOf('pot') >= 0) {
        if(extra_data?.item) {
            extra_data = extra_data ? extra_data : {};
            const drop_item = extra_data?.item;
            drop_item.count = 1;
            delete(extra_data.item);
            actions.addBlocks([{pos: new Vector(pos), item: {id: world_block.id, rotate: rotate, extra_data: extra_data}, action_id: ServerClient.BLOCK_ACTION_MODIFY}]);
            actions.addPlaySound({tag: 'madcraft:block.cloth', action: 'hit', pos: new Vector(pos), except_players: [player.session.user_id]});
            // Create drop item
            actions.addDropItem({pos: world_block.posworld.add(new Vector(.5, 0, .5)), items: [drop_item], force: true});
            return true;
        }
    }
    return false;
}

// Посадить растения можно только на блок земли
async function restrictPlanting(e, world, pos, player, world_block, world_material, mat_block, current_inventory_item, extra_data, rotate, replace_block, actions) {
    if(!mat_block.planting) {
        return false;
    }
    const underBlock = world.getBlock(new Vector(pos.x, pos.y - 1, pos.z));
    if(!underBlock) {
        return true;
    }
    if([BLOCK.GRASS_DIRT.id, BLOCK.FARMLAND.id, BLOCK.FARMLAND_WET.id].indexOf(underBlock.id) < 0) {
        return true;
    }
    // Посадить семена можно только на вспаханную землю
    if(mat_block.seeds && [BLOCK.FARMLAND.id, BLOCK.FARMLAND_WET.id].indexOf(underBlock.id) < 0) {
        return true;
    }
    return false;
}

// Можно поставить только на полный (непрозрачный блок, снизу)
async function restrictOnlyFullFace(e, world, pos, player, world_block, world_material, mat_block, current_inventory_item, extra_data, rotate, replace_block, actions) {
    if(mat_block.tags.indexOf('set_only_fullface') >= 0) {
        const underBlock = world.getBlock(new Vector(pos.x, pos.y - 1, pos.z));
        if(!underBlock || underBlock.material.transparent) {
            return true;
        }
    }
    return false;
}

// Проверка места под лестницу/лианы
async function restrictLadder(e, world, pos, player, world_block, world_material, mat_block, current_inventory_item, extra_data, rotate, replace_block, actions) {
    if(['ladder'].indexOf(mat_block.style) < 0) {
        return false;
    }
    // Лианы можно ставить на блоки с прозрачностью
    if(world_material.transparent && world_material.style != 'default') {
        return true;
    }
    //
    if(pos.n.y != 0) {
        let cardinal_direction = orientation.x;
        let ok = false;
        for(let i = 0; i < 4; i++) {
            let pos2 = new Vector(pos.x, pos.y, pos.z);
            let cd = cardinal_direction + i;
            if(cd > 4) cd -= 4;
            // F R B L
            switch(cd) {
                case ROTATE.S: {
                    pos2 = pos2.add(new Vector(0, 0, 1));
                    break;
                }
                case ROTATE.W: {
                    pos2 = pos2.add(new Vector(1, 0, 0));
                    break;
                }
                case ROTATE.N: {
                    pos2 = pos2.add(new Vector(0, 0, -1));
                    break;
                }
                case ROTATE.E: {
                    pos2 = pos2.add(new Vector(-1, 0, 0));
                    break;
                }
            }
            const cardinal_block = world.getBlock(pos2);
            if(cardinal_block.transparent && !(mat_block.tags.indexOf('anycardinal') >= 0)) {
                cardinal_direction = cd;
                ok = true;
                break;
            }
        }
        if(!ok) {
            return true;
        }
    }
    return false;
}

// Факелы можно ставить только на определенные виды блоков!
async function restrictTorch(e, world, pos, player, world_block, world_material, mat_block, current_inventory_item, extra_data, rotate, replace_block, actions) {
    if(mat_block.style != 'torch') {
        return false;
    }
    return !replace_block && (
        (pos.n.y < 0) ||
        (world_material.width && world_material.width != 1) ||
        (world_material.height && world_material.height != 1) ||
        ['default', 'fence', 'wall'].indexOf(world_material.style) < 0 ||
        (['fence', 'wall'].indexOf(world_material.style) >= 0 && pos.n.y != 1)
    );
}

//
async function useShovel(e, world, pos, player, world_block, world_material, mat_block, current_inventory_item, extra_data, rotate, replace_block, actions) {
    if(mat_block.item.name != 'instrument' || mat_block.item.instrument_id != 'shovel') {
        return false;
    }
    if(world_material.id == BLOCK.GRASS_DIRT.id || world_material.id == BLOCK.DIRT.id) {
        const extra_data = null;
        pos.x -= pos.n.x;
        pos.y -= pos.n.y;
        pos.z -= pos.n.z;
        actions.addBlocks([{pos: new Vector(pos), item: {id: BLOCK.DIRT_PATH.id, rotate: rotate, extra_data: extra_data}, action_id: ServerClient.BLOCK_ACTION_REPLACE}]);
        actions.decrement = true;
        if(mat_block.sound) {
            actions.addPlaySound({tag: mat_block.sound, action: 'place', pos: new Vector(pos), except_players: [player.session.user_id]});
        }
        return true;
    }
    if(world_material.name == 'CAMPFIRE') {
        extra_data.active = false;
        actions.addBlocks([{pos: world_block.posworld.clone(), item: {id: world_material.id, rotate: rotate, extra_data: extra_data}, action_id: ServerClient.BLOCK_ACTION_MODIFY}]);
        return true;
    }
    return false;
}

//
async function useHoe(e, world, pos, player, world_block, world_material, mat_block, current_inventory_item, extra_data, rotate, replace_block, actions) {
    if(mat_block.item.name != 'instrument' || mat_block.item.instrument_id != 'hoe') {
        return false;
    }
    if(world_material.id == BLOCK.GRASS_DIRT.id || world_material.id == BLOCK.DIRT_PATH.id || world_material.id == BLOCK.DIRT.id) {
        const extra_data = null;
        pos.x -= pos.n.x;
        pos.y -= pos.n.y;
        pos.z -= pos.n.z;
        actions.addBlocks([{pos: new Vector(pos), item: {id: BLOCK.FARMLAND.id, rotate: rotate, extra_data: extra_data}, action_id: ServerClient.BLOCK_ACTION_REPLACE}]);
        actions.decrement = true;
        if(mat_block.sound) {
            actions.addPlaySound({tag: mat_block.sound, action: 'place', pos: new Vector(pos), except_players: [player.session.user_id]});
        }
        return true;
    }
    return false;
}

// "Наслаивание" блока друг на друга, при этом блок остается 1, но у него увеличивается высота (максимум до 1)
async function increaseLayering(e, world, pos, player, world_block, world_material, mat_block, current_inventory_item, extra_data, rotate, replace_block, actions) {
    //
    const pos_n = pos.n;
    pos = new Vector(pos);
    //
    const block_touched = world.getBlock(pos);
    if((block_touched?.id == mat_block.id) && !!mat_block.is_layering) {
        // ok
    } else {
        pos.x += pos_n.x;
        pos.y += pos_n.y;
        pos.z += pos_n.z;
        const block_on_posn = world.getBlock(pos);
        if((block_on_posn?.id == mat_block.id) && !!mat_block.is_layering) {
            // pos.n.y = 1;
            extra_data = block_on_posn.extra_data;
            world_block = block_on_posn;
            world_material = block_on_posn.material;
        } else {
            return false;
        }
    }
    //
    if(!world_material.layering) {
        return false;
    }
    //
    const layering = world_material.layering;
    let new_extra_data = null;
    if(extra_data) {
        new_extra_data = JSON.parse(JSON.stringify(extra_data));
    } else {
        new_extra_data = {height: layering.height};
    }
    new_extra_data.height += layering.height;
    if(new_extra_data.height < 1) {
        // add part
        actions.addBlocks([{pos: new Vector(pos), item: {id: world_material.id, rotate: rotate, extra_data: new_extra_data}, action_id: ServerClient.BLOCK_ACTION_MODIFY}]);
        actions.addPlaySound({tag: world_material.sound, action: 'place', pos: new Vector(pos), except_players: [player.session.user_id]});
    } else {
        // replace to full block
        const full_block = BLOCK.fromName(layering.full_block_name);
        actions.addBlocks([{pos: new Vector(pos), item: {id: full_block.id}, action_id: ServerClient.BLOCK_ACTION_CREATE}]);
        actions.addPlaySound({tag: full_block.sound, action: 'place', pos: new Vector(pos), except_players: [player.session.user_id]});
    }
    actions.reset_target_pos = true;
    actions.decrement = true;
    return true;
}