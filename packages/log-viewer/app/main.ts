import { connectDevframe } from 'devframe/client'
import { LOG_VIEWER_ID } from '../src/log-viewer/log-viewer.constants.ts'
import { mountLogView } from './log-view/log-view.ts'
import './style.css'

const root = document.querySelector<HTMLElement>('#app')
if (!root) throw new Error('#app mount node missing from index.html')

const rpc = await connectDevframe()
const log = await rpc.call(`${LOG_VIEWER_ID}:load-log`)
mountLogView(root, log)
