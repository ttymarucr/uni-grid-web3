import {
  assert,
  describe,
  test,
  clearStore,
  beforeAll,
  afterAll
} from "matchstick-as/assembly/index"
import { Address } from "@graphprotocol/graph-ts"
import { GridDeployed } from "../generated/schema"
import { GridDeployed as GridDeployedEvent } from "../generated/GridManager/GridManager"
import { handleGridDeployed } from "../src/grid-manager"
import { createGridDeployedEvent } from "./grid-manager-utils"

// Tests structure (matchstick-as >=0.5.0)
// https://thegraph.com/docs/en/developer/matchstick/#tests-structure-0-5-0

describe("Describe entity assertions", () => {
  beforeAll(() => {
    let owner = Address.fromString("0x0000000000000000000000000000000000000001")
    let gridPositionManager = Address.fromString(
      "0x0000000000000000000000000000000000000001"
    )
    let pool = Address.fromString("0x0000000000000000000000000000000000000001")
    let newGridDeployedEvent = createGridDeployedEvent(
      owner,
      gridPositionManager,
      pool
    )
    handleGridDeployed(newGridDeployedEvent)
  })

  afterAll(() => {
    clearStore()
  })

  // For more test scenarios, see:
  // https://thegraph.com/docs/en/developer/matchstick/#write-a-unit-test

  test("GridDeployed created and stored", () => {
    assert.entityCount("GridDeployed", 1)

    // 0xa16081f360e3847006db660bae1c6d1b2e17ec2a is the default address used in newMockEvent() function
    assert.fieldEquals(
      "GridDeployed",
      "0xa16081f360e3847006db660bae1c6d1b2e17ec2a-1",
      "owner",
      "0x0000000000000000000000000000000000000001"
    )
    assert.fieldEquals(
      "GridDeployed",
      "0xa16081f360e3847006db660bae1c6d1b2e17ec2a-1",
      "gridPositionManager",
      "0x0000000000000000000000000000000000000001"
    )
    assert.fieldEquals(
      "GridDeployed",
      "0xa16081f360e3847006db660bae1c6d1b2e17ec2a-1",
      "pool",
      "0x0000000000000000000000000000000000000001"
    )

    // More assert options:
    // https://thegraph.com/docs/en/developer/matchstick/#asserts
  })
})
