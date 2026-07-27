import { OPS } from 'pdfjs-dist/legacy/build/pdf.mjs'

import { IDENTITY_MATRIX, multiplyMatrices, toMatrix } from './affine-matrix'
import type { Matrix } from './affine-matrix'
import type { OperatorList } from './pdfjs-types'

interface WalkState {
  ctm: Matrix
  ctmStack: Matrix[]
  ctmByIndex: Matrix[]
}

/**
 * Returns the current transformation matrix (CTM) in effect at each operator
 * in the list — the CTM that operator's own coordinates should be
 * interpreted against. Tracks `save`/`restore`/`transform` (PDF's `q`/`Q`/
 * `cm`), and Form XObjects (`paintFormXObjectBegin`/`End`), which push and
 * pop their own nested transform the same way `q cm ... Q` does. Any
 * geometry-bearing op (constructPath, paintImageXObject, ...) can look up
 * `ctmByIndex[i]` to know what space its own args are in.
 */
export function trackCtm(operatorList: OperatorList): Matrix[] {
  const initialState: WalkState = {
    ctm: IDENTITY_MATRIX,
    ctmStack: [],
    ctmByIndex: [],
  }

  const finalState = operatorList.fnArray.reduce<WalkState>(
    (state, fn, index) => stepCtm(state, fn, operatorList.argsArray[index]),
    initialState
  )

  return finalState.ctmByIndex
}

function stepCtm(state: WalkState, fn: number, args: unknown): WalkState {
  const ctmByIndex = [...state.ctmByIndex, state.ctm]

  if (fn === OPS.save) {
    return {
      ctm: state.ctm,
      ctmStack: [...state.ctmStack, state.ctm],
      ctmByIndex,
    }
  }

  if (fn === OPS.restore) {
    return { ...popCtm(state), ctmByIndex }
  }

  if (fn === OPS.transform) {
    const matrix = toMatrix(args)
    const ctm = matrix ? multiplyMatrices(matrix, state.ctm) : state.ctm
    return { ctm, ctmStack: state.ctmStack, ctmByIndex }
  }

  if (fn === OPS.paintFormXObjectBegin) {
    // args = [matrix, bbox] — the clip bbox is ignored, we only need the
    // matrix to keep nested content in the right coordinate space.
    const matrix = Array.isArray(args) ? toMatrix(args[0]) : null
    const ctm = matrix ? multiplyMatrices(matrix, state.ctm) : state.ctm
    return { ctm, ctmStack: [...state.ctmStack, state.ctm], ctmByIndex }
  }

  if (fn === OPS.paintFormXObjectEnd) {
    return { ...popCtm(state), ctmByIndex }
  }

  return { ...state, ctmByIndex }
}

function popCtm(state: WalkState): Omit<WalkState, 'ctmByIndex'> {
  const previousCtm = state.ctmStack.at(-1) ?? IDENTITY_MATRIX
  return { ctm: previousCtm, ctmStack: state.ctmStack.slice(0, -1) }
}
