const LABELS = [
	'January',
	'February',
	'March',
	'April',
	'May',
	'June',
	'July',
	'August',
	'September',
	'October',
	'November',
	'December',
]

const PRODUCT_NAMES = [
	'Widget A',
	'Widget B',
	'Gadget X',
	'Gadget Y',
	'Service Alpha',
	'Service Beta',
]

const COLORS = ['#4F46E5', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4']

function rand(min: number, max: number): number {
	return Math.floor(Math.random() * (max - min + 1)) + min
}

function pick<T>(arr: T[], count: number): T[] {
	const shuffled = [...arr].sort(() => Math.random() - 0.5)

	return shuffled.slice(0, count)
}

function seriesData(length: number, min = 10, max = 100) {
	return Array.from({ length }, () => rand(min, max))
}

interface ChartDataset {
	label: string
	data: number[]
	backgroundColor?: string | string[]
	borderColor?: string
}

interface ChartData {
	labels: string[]
	datasets: ChartDataset[]
}

function axisChartData(seriesCount = 2): ChartData {
	const months = pick(LABELS, rand(5, 8))
	const colors = pick(COLORS, seriesCount)

	return {
		labels: months,
		datasets: Array.from({ length: seriesCount }, (_, i) => ({
			label: PRODUCT_NAMES[i] ?? `Series ${i + 1}`,
			data: seriesData(months.length),
			backgroundColor: colors[i],
			borderColor: colors[i],
		})),
	}
}

function pieData(): ChartData {
	const slices = pick(PRODUCT_NAMES, rand(3, 6))

	return {
		labels: slices,
		datasets: [
			{
				label: 'Revenue',
				data: seriesData(slices.length, 1000, 50000),
				backgroundColor: COLORS.slice(0, slices.length),
			},
		],
	}
}

interface ScatterPoint {
	x: number
	y: number
}

interface ScatterDataset {
	label: string
	data: ScatterPoint[]
	backgroundColor: string
}

function scatterData(): { datasets: ScatterDataset[] } {
	const count = rand(2, 3)
	const colors = pick(COLORS, count)

	return {
		datasets: Array.from({ length: count }, (_, i) => ({
			label: PRODUCT_NAMES[i] ?? `Group ${i + 1}`,
			data: Array.from({ length: rand(8, 15) }, () => ({
				x: rand(0, 100),
				y: rand(0, 100),
			})),
			backgroundColor: colors[i],
		})),
	}
}

interface BubblePoint {
	x: number
	y: number
	r: number
}

interface BubbleDataset {
	label: string
	data: BubblePoint[]
	backgroundColor: string
}

function bubbleData(): { datasets: BubbleDataset[] } {
	const count = rand(2, 3)
	const colors = pick(COLORS, count)

	return {
		datasets: Array.from({ length: count }, (_, i) => ({
			label: PRODUCT_NAMES[i] ?? `Group ${i + 1}`,
			data: Array.from({ length: rand(5, 10) }, () => ({
				x: rand(0, 100),
				y: rand(0, 100),
				r: rand(3, 20),
			})),
			backgroundColor: colors[i],
		})),
	}
}

interface ComboDataset {
	label: string
	data: number[]
	type: 'bar' | 'line'
	backgroundColor?: string
	borderColor?: string
}

function comboData(): { labels: string[]; datasets: ComboDataset[] } {
	const months = pick(LABELS, rand(5, 8))
	const colors = pick(COLORS, 2)

	return {
		labels: months,
		datasets: [
			{
				label: 'Revenue',
				data: seriesData(months.length, 5000, 30000),
				type: 'bar',
				backgroundColor: colors[0],
			},
			{
				label: 'Trend',
				data: seriesData(months.length, 5000, 30000),
				type: 'line',
				borderColor: colors[1],
			},
		],
	}
}

interface GridColumn {
	key: string
	label: string
}

interface GridData {
	columns: GridColumn[]
	rows: Record<string, string | number>[]
}

function gridData(): GridData {
	const columns: GridColumn[] = [
		{ key: 'name', label: 'Name' },
		{ key: 'category', label: 'Category' },
		{ key: 'price', label: 'Price' },
		{ key: 'quantity', label: 'Quantity' },
		{ key: 'total', label: 'Total' },
	]

	const categories = ['Electronics', 'Software', 'Services', 'Hardware']

	const rows = PRODUCT_NAMES.slice(0, rand(3, 6)).map((name) => {
		const price = rand(10, 500)
		const quantity = rand(1, 100)
		return {
			name,
			category: categories[rand(0, categories.length - 1)],
			price,
			quantity,
			total: price * quantity,
		}
	})

	return { columns, rows }
}

export type ToolType =
	| 'BarChart'
	| 'LineChart'
	| 'AreaChart'
	| 'ScatterChart'
	| 'BubbleChart'
	| 'PieChart'
	| 'DonutChart'
	| 'ComboChart'
	| 'Grid'

const TOOL_TYPES: ToolType[] = [
	'BarChart',
	'LineChart',
	'AreaChart',
	'ScatterChart',
	'BubbleChart',
	'PieChart',
	'DonutChart',
	'ComboChart',
	'Grid',
]

const generators: Record<ToolType, () => unknown> = {
	BarChart: () => axisChartData(rand(1, 3)),
	LineChart: () => axisChartData(rand(1, 3)),
	AreaChart: () => axisChartData(rand(1, 3)),
	ScatterChart: scatterData,
	BubbleChart: bubbleData,
	PieChart: pieData,
	DonutChart: pieData,
	ComboChart: comboData,
	Grid: gridData,
}

export function randomTool(): { type: ToolType; data: unknown } {
	const type = TOOL_TYPES[Math.floor(Math.random() * TOOL_TYPES.length)]

	return { type, data: generators[type]() }
}
