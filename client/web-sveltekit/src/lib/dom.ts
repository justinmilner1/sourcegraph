import {
    autoUpdate,
    computePosition,
    flip,
    shift,
    arrow,
    type Placement,
    type Middleware,
    offset,
    type OffsetOptions,
    type ShiftOptions,
    type FlipOptions,
} from '@floating-ui/dom'
import { tick } from 'svelte'
import type { Action } from 'svelte/action'
import * as uuid from 'uuid'

import { highlightNode } from '$lib/common'

/**
 * Finds the previous sibling element that matches the provided selector. Can optionally wrap around.
 *
 * @param element The element to start the search from.
 * @param selector The selector to match the sibling against.
 * @param wrap Whether to wrap around to the last sibling if no match is found.
 * @returns The previous sibling element that matches the selector, or null if no match is found.
 */
export function previousSibling(element: Element, selector: string, wrap = false): Element | null {
    let sibling = element.previousElementSibling
    while (true) {
        while (sibling) {
            if (sibling.matches(selector)) {
                return sibling
            }

            // Prevents infinite loop when wrapping around
            if (sibling === element) {
                return null
            }

            sibling = sibling.previousElementSibling
        }

        if (wrap) {
            sibling = element.parentElement?.lastElementChild ?? null
        } else {
            return null
        }
    }
}

/**
 * Finds the next sibling element that matches the provided selector. Can optionally wrap around.
 *
 * @param element The element to start the search from.
 * @param selector The selector to match the sibling against.
 * @param wrap Whether to wrap around to the first sibling if no match is found.
 * @returns The next sibling element that matches the selector, or null if no match is found.
 */
export function nextSibling(element: Element, selector: string, wrap = false): Element | null {
    let sibling = element.nextElementSibling
    while (true) {
        while (sibling) {
            if (sibling.matches(selector)) {
                return sibling
            }

            // Prevents infinite loop when wrapping around
            if (sibling === element) {
                return null
            }

            sibling = sibling.nextElementSibling
        }

        if (wrap) {
            sibling = element.parentElement?.firstElementChild ?? null
        } else {
            return null
        }
    }
}

/**
 * Returns a unique ID to be used with accessible elements.
 * Generates stable IDs in tests.
 */
export function uniqueID(prefix = ''): string {
    if (process.env.VITEST) {
        return `test-${prefix}-123`
    }
    return `${prefix}-${uuid.v4()}`
}

/**
 * An action that dispatches a custom 'click-outside' event when the user clicks
 * outside the attached element.
 */
export const onClickOutside: Action<
    HTMLElement,
    { enabled?: boolean } | undefined,
    { 'on:click-outside': (event: CustomEvent<HTMLElement>) => void }
> = (node, { enabled } = { enabled: true }) => {
    function handler(event: MouseEvent): void {
        if (event.target && !node.contains(event.target as HTMLElement)) {
            node.dispatchEvent(new CustomEvent('click-outside', { detail: event.target }))
        }
    }

    if (enabled) {
        window.addEventListener('mousedown', handler)
    }

    return {
        update({ enabled } = { enabled: true }) {
            if (enabled) {
                window.addEventListener('mousedown', handler)
            } else {
                window.removeEventListener('mousedown', handler)
            }
        },
        destroy() {
            window.removeEventListener('mousedown', handler)
        },
    }
}

interface PopoverOptions {
    /**
     * The placement of the popover relative to the reference element.
     */
    placement?: Placement
    /**
     * Options for @floatin-ui's offset middleware.
     * The middleware is only enabled if this option is provided.
     */
    offset?: OffsetOptions
    /**
     * Options for @floatin-ui's shift middleware.
     * The middleware is always enabled.
     */
    shift?: ShiftOptions
    /**
     * Options for @floatin-ui's flip middleware.
     * The middleware is always enabled.
     */
    flip?: FlipOptions
}

/**
 * An action that converts the attached element into a popover using @floating-ui.
 * If the popover element contains an element with the attribute `data-arrow`, it will be used as the arrow
 * and the arrow middleware will be enabled.
 */
export const popover: Action<HTMLElement, { reference: Element; options: PopoverOptions }> = (popover, parameters) => {
    let cleanup: (() => void) | null = null

    function update(popover: HTMLElement, { reference, options }: { reference: Element; options: PopoverOptions }) {
        const arrowElement = popover.querySelector('[data-arrow]') as HTMLElement | null
        const middleware: Middleware[] = []
        if (options.offset !== undefined) {
            middleware.push(offset(options.offset))
        }
        middleware.push(shift(options.shift), flip(options.flip))
        if (arrowElement) {
            middleware.push(arrow({ element: arrowElement }))
        }
        return autoUpdate(reference, popover, () => {
            computePosition(reference, popover, {
                placement: options.placement ?? 'bottom',
                middleware,
            }).then(({ x, y, placement, middlewareData }) => {
                popover.style.left = `${x}px`
                popover.style.top = `${y}px`

                if (middlewareData.arrow && arrowElement) {
                    const { x, y } = middlewareData.arrow
                    arrowElement.style.left = x !== undefined ? `${x}px` : ''
                    arrowElement.style.top = y !== undefined ? `${y}px` : ''
                    arrowElement.dataset.placement = placement
                }
            })
        })
    }

    cleanup = update(popover, parameters)
    return {
        update(parameter) {
            cleanup?.()
            cleanup = update(popover, parameter)
        },
        destroy() {
            cleanup?.()
        },
    }
}

/**
 * Updates the DOM to highlight the provided ranges.
 * IMPORTANT: If the element content is dynamic you have to ensure that the attached is recreated
 * to properly update and re-highlight the content. One way to enforce this is to use #key
 */
export const highlightRanges: Action<HTMLElement, { ranges: [number, number][] }> = (node, parameters) => {
    function highlight({ ranges }: { ranges: [number, number][] }) {
        if (ranges.length > 0) {
            for (const [start, end] of ranges) {
                highlightNode(node, start, end - start)
            }
        }
    }

    highlight(parameters)

    return {
        update: highlight,
    }
}

/**
 * This action ensures that the element does not extend outside the visible viewport,
 * by settings its max height. Only works for elements whose position doesn't change
 * relative to the viewport.
 */
export const restrictToViewport: Action<HTMLElement, { offset?: number }> = (node, parameters) => {
    let offset = parameters.offset ?? 0

    function setMaxHeight(): void {
        node.style.maxHeight = window.innerHeight - node.getBoundingClientRect().top + offset + 'px'
    }

    window.addEventListener('resize', setMaxHeight)

    setMaxHeight()

    return {
        update(parameter) {
            offset = parameter.offset ?? 0
            setMaxHeight()
        },

        destroy() {
            window.removeEventListener('resize', setMaxHeight)
        },
    }
}

interface ComputeFitAttributes {
    'on:fit': (event: CustomEvent<{ itemCount: number }>) => void
}

/**
 * An action to compute the number of elements that fit inside the container.
 * This works by caching the position of the right hand of each child element,
 * and then comparing it to the right hand of the container.
 *
 * Because of this this action only works for static element lists,
 * i.e. on initial render the node needs to contain all possible child elements.
 */
export const computeFit: Action<HTMLElement, void, ComputeFitAttributes> = node => {
    // Holds the cumulative width of all elements up to element i.
    const widths: number[] = [0]

    // Used to compute the "end" of each child relative to the parent container.
    // This ensures that the logic here still works when the parent node is moved
    // or when it is scrolled inside a scroll container.
    const offset = node.getBoundingClientRect().left

    for (let i = 0; i < node.children.length; i++) {
        widths[i + 1] = node.children[i].getBoundingClientRect().right - offset
    }

    function compute(): void {
        const nodeWidth = node.getBoundingClientRect().width
        for (let i = widths.length - 1; i >= 0; i--) {
            if (widths[i] < nodeWidth) {
                node.dispatchEvent(new CustomEvent('fit', { detail: { itemCount: i } }))
                return
            }
        }
    }

    compute()
    const observer = new ResizeObserver(compute)
    observer.observe(node)

    return {
        destroy() {
            observer.disconnect()
        },
    }
}

/**
 * Helper action to manage CSS classes on an element. This is used on svelte:body because
 * it doesn't support the class directive.
 * See https://github.com/sveltejs/svelte/issues/3105
 */
export const classNames: Action<HTMLElement, string | string[]> = (node, classes) => {
    // Converts the input to an array of non-empty strings.
    // Empty strings are not valid inputs for classList and would throw an error.
    function clean(classes: string | string[]): string[] {
        return (Array.isArray(classes) ? classes : [classes]).filter(cls => cls.trim().length > 0)
    }

    classes = clean(classes)
    node.classList.add(...classes)

    return {
        update(newClasses) {
            node.classList.remove(...classes)
            classes = clean(newClasses)
            node.classList.add(...classes)
        },
        destroy() {
            node.classList.remove(...classes)
        },
    }
}

/**
 * An action by default to move the attached element to the end
 * of the document body, optionally if container node is passed
 * attach current node element to the container instead.
 */
export const portal: Action<HTMLElement, { container?: HTMLElement | null } | undefined> = (target, options) => {
    const root = options?.container ?? window.document.body

    root.appendChild(target)

    return {
        update(options) {
            const root = options?.container ?? window.document.body
            root.appendChild(target)
        },
        destroy() {
            target.parentElement?.removeChild(target)
        },
    }
}

/**
 * An action that resizes an element with the provided grow and shrink callbacks until the target element no longer overflows.
 *
 * @param grow A callback to increase the size of the contained contents. Returns a boolean indicating more growth is possible.
 * @param shrink A callback to reduce the size of the contained contents. Returns a boolean indicating more shrinking is possible.
 * @returns An action that updates the overflow state of the element.
 */
export const sizeToFit: Action<HTMLElement, { grow: () => boolean; shrink: () => boolean }> = (
    target,
    { grow, shrink }
) => {
    async function resize(): Promise<void> {
        if (target.scrollWidth > target.clientWidth) {
            // Shrink until we fit
            while (target.scrollWidth > target.clientWidth) {
                if (!shrink()) {
                    return
                }
                await tick()
            }
        } else {
            // Grow until we overflow, then shrink once
            while (target.scrollWidth <= target.clientWidth && grow()) {
                await tick()
            }
            await tick()
            if (target.scrollWidth > target.clientWidth) {
                shrink()
                await tick()
            }
        }
    }

    // Resizing can (and probably will) trigger mutations, so do not trigger a
    // new resize if there is a resize in progress.
    let resizing = false
    function resizeOnce() {
        if (resizing) {
            return
        }
        resizing = true
        resize().then(() => {
            resizing = false
        })
    }

    const resizeObserver = new ResizeObserver(resizeOnce)
    resizeObserver.observe(target)
    const mutationObserver = new MutationObserver(resizeOnce)
    mutationObserver.observe(target, { attributes: true, childList: true, characterData: true, subtree: true })
    return {
        update(params) {
            grow = params.grow
            shrink = params.shrink
            resizeOnce()
        },
        destroy() {
            resizeObserver.disconnect()
            mutationObserver.disconnect()
        },
    }
}

/**
 * This action scrolls the associated element into view when it is mounted and the argument is true.
 *
 * @param node The element to scroll into view.
 * @param scroll Whether to scroll the element into view.
 */
export const scrollIntoViewOnMount: Action<HTMLElement, boolean> = (node: HTMLElement, scroll: boolean) => {
    if (scroll) {
        window.requestAnimationFrame(() => node.scrollIntoView({ block: 'center' }))
    }
}
