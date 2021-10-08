package Type

import (
	"sync"

	"madcraft.io/madcraft/Struct"
)

type (
	// WorldMan ...
	WorldMan struct {
		Worlds map[string]*World // Registered connections
	}
)

func (this *WorldMan) Get(ID string, Seed string) *World {
	if val, ok := this.Worlds[ID]; ok {
		return val
	}
	//
	this.Worlds[ID] = &World{
		ID:          ID,
		Seed:        Seed,
		Mu:          &sync.Mutex{},
		Connections: make(map[string]*UserConn, 0),
		Chunks:      make(map[Struct.Vector3]*Chunk, 0),
		Entities:    &EntityManager{},
	}
	this.Worlds[ID].Load()
	return this.Worlds[ID]
}
