import {BLOCK} from "../blocks.js";

export class Instrument_Hand {

    constructor(inventory_item, inventory) {
        this.inventory_item = inventory_item;
        this.inventory = inventory;
    }

    //
    destroyBlock(block) {
        let inventory_item = this.inventory_item;
        if(inventory_item) {
            if(inventory_item.instrument_id) {
                let damage = .01;
                inventory_item.power = Math.round((inventory_item.power - damage) * 100) / 100;
                if(inventory_item.power <= 0) {
                    this.inventory.decrement();
                }
            }
        }
        if(block.id == BLOCK.CONCRETE.id) {
            block = BLOCK.fromId(BLOCK.COBBLESTONE.id);
        }
        if([BLOCK.GRASS.id, BLOCK.CHEST.id].indexOf(block.id) < 0) {
            this.inventory.increment(Object.assign({count: 1}, block));
        }
        return true;
    }

}