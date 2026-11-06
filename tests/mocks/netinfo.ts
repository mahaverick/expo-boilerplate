/**
 * @file Stands in for `@react-native-community/netinfo`. Registered in
 * `jest.config.ts`; it is the library's documented Jest mock, whose methods
 * are `jest.fn`, so a test can capture the listener or change the state.
 */
import { jest } from '@jest/globals'
import type { NetInfoState } from '@react-native-community/netinfo'

/** The surface of the library's Jest mock that the app and its tests use. */
interface NetInfoMock {
  addEventListener: jest.Mock<(listener: (state: NetInfoState) => void) => () => void>
}

const mock = jest.requireActual<NetInfoMock>('@react-native-community/netinfo/jest/netinfo-mock.js')

export default mock
/** The mock's `addEventListener`. */
export const addEventListener = mock.addEventListener
