import {RecipeWindow} from "./window/index.js";
import {Helpers} from "./helpers.js";

export class RecipeManager {

    constructor(block_manager, inventory_image) {
        this.inventory_image = inventory_image;
        this.block_manager = block_manager;
        this.all = [];
        this.crafting_shaped = {
            list: [],
            searchRecipeResult: function(pattern_array) {
                for(let recipe of this.list) {
                    if(recipe.pattern_array.length == pattern_array.length) {
                        if(recipe.pattern_array.every((val, index) => val === pattern_array[index])) {
                            return recipe.result;
                        }
                    }
                }
                return null;
            }
        };
        this.load(() => {
            // Recipe window
            this.frmRecipe = new RecipeWindow(this.block_manager, this, 10, 10, 294, 332, 'frmRecipe', null, null);
            Game.hud.wm.add(this.frmRecipe);
        });
    }

    add(recipe) {
        if(!recipe) {
            throw 'Empty recipe';
        }
        let type = recipe.type.split(':')[1];
        switch(type) {
            case 'crafting_shaped': {
                // parse result
                if(!recipe.hasOwnProperty('result')) {
                    throw 'Recipe result not defined';
                }
                let result_block = this.block_manager.fromName(recipe.result.item);
                if(result_block.id == this.block_manager.DUMMY.id) {
                    throw 'Invalid recipe result block type ' + recipe.result.item;
                }
                recipe.result.item_id = result_block.id;
                // Create key map
                let keys = {};
                for(let key of Object.keys(recipe.key)) {
                    let value = recipe.key[key];
                    if(value.hasOwnProperty('item')) {
                        let block = this.block_manager.fromName(value.item);
                        if(block.id == this.block_manager.DUMMY.id) {
                            throw 'Invalid recipe key name ' + value.item;
                        }
                        keys[key] = block.id;
                    } else if(value.hasOwnProperty('tag')) {
                        let tag = value.tag;
                        if(this.block_manager.BLOCK_BY_TAGS.hasOwnProperty(tag)) {
                            for(let block of this.block_manager.BLOCK_BY_TAGS[tag]) {
                            }
                        } else {
                            throw 'items with tag `' + tag + '` not found';
                        }
                        debugger;
                    } else {
                        throw 'Recipe key not have valie property `item` or `tag`';
                    }
                }
                let r = Object.assign({}, recipe);
                r.pattern_array = this.makeRecipePattern(recipe.pattern, keys);
                this.crafting_shaped.list.push(r);
                break;
            }
            default: {
                throw 'Invalid recipe type ' + recipe.type;
                break;
            }
        }
    }

    makeRecipePattern(pattern, keys) {
        // Make pattern
        for(let pk in pattern) {
            if(pattern[pk].length < 3) {
                pattern[pk] = (pattern[pk] + '   ').substring(0, 3);
            }
        }
        return pattern
            .join('')
            .trim()
            .split('')
            .map(function(key) {
                if(key == ' ') {
                    return null;
                }
                if(!keys.hasOwnProperty(key)) {
                    throw 'Invalid recipe pattern key `' + key + '`';
                }
                return keys[key];
            });
    }

    load(callback) {
        let that = this;
        Helpers.loadJSON('../data/recipes.json', function(json) {
            for(let recipe of json) {
                that.add(recipe);
            }
            callback();
        });
    }

}