import {
    ButtonItem,
    Dropdown,
    DropdownOption,
    Focusable,
    PanelSection,
    TextField,
} from 'decky-frontend-lib'
import lunr, { Token } from 'lunr'
import { VFC, useEffect, useState } from 'react'
import { FaSearch } from 'react-icons/fa'
import { humanReadableTime } from '../app/formatters'
import { GameWithTime } from '../app/model'
import { excludeApps } from '../app/time-manipulation'
import { PageWrapper } from '../components/PageWrapper'
import { useLocator } from '../locator'
import { TableCSS } from '../styles'
import { ifNull, map } from '../utils'
import { navigateBack } from './navigation'

interface TableRowsProps {
    appId: string | undefined
    playTimeTrackedSec: number | undefined
    desiredHours: number | undefined
}

export const ManuallyAdjustTimePage: VFC = () => {
    const { timeManipulation: timeMigration } = useLocator()
    const [isLoading, setLoading] = useState<Boolean>(true)
    const [gameWithTimeByAppId, setGameWithTimeByAppId] = useState<
        Map<string, GameWithTime>
    >(new Map())
    const [gameSearchIdx, setGameSearchIdx] = useState<ReturnType<typeof lunr>>()
    const [gameOptionsFilter, setGameOptionsFilter] = useState<
        (it: GameWithTime) => boolean
    >(() => (_: GameWithTime) => true)
    const [gameOptions, setGameOptions] = useState<DropdownOption[]>([])
    const [tableRows, setTableRows] = useState<TableRowsProps[]>([])

    useEffect(() => {
        setGameOptions(
            Array.from(gameWithTimeByAppId.values())
                .filter(gameOptionsFilter)
                .map((it) => {
                    return {
                        data: it.game.id,
                        label: it.game.name,
                    } as DropdownOption
                })
        )
    }, [gameWithTimeByAppId, gameOptionsFilter])

    useEffect(() => {
        setLoading(true)
        timeMigration.fetchPlayTimeForAllGames([excludeApps]).then((playTime) => {
            setGameWithTimeByAppId(playTime)
            setGameSearchIdx(
                lunr(function () {
                    this.ref('id')
                    this.field('name')

                    // Search names without diacritics
                    const normalizer = (token: Token): null | Token | Token[] =>
                        token.update((str) =>
                            str.normalize('NFD').replace(/\p{Diacritic}/gu, '')
                        )
                    lunr.Pipeline.registerFunction(normalizer, 'normalizer')
                    this.pipeline.before(lunr.stemmer, normalizer)

                    Array.from(playTime.values()).forEach((it) =>
                        this.add({ id: it.game.id, name: it.game.name })
                    )
                })
            )
            setTableRows([
                {
                    appId: undefined,
                    desiredHours: undefined,
                    playTimeTrackedSec: undefined,
                },
            ])
            setLoading(false)
        })
    }, [])

    if (isLoading) {
        return <PageWrapper>Loading...</PageWrapper>
    }

    const onSearchChange = (index: number, search: string) => {
        const searchPattern = search.includes('*')
            ? search
            : // Add wildcards to every term for "normal" default searching
              `*${search.split('\\s+').join('* *')}*`
        const matchingAppIds = new Set(
            gameSearchIdx?.search(searchPattern).map((result) => result.ref)
        )
        setGameOptionsFilter(() => (it: GameWithTime) => matchingAppIds.has(it.game.id))
    }

    const onGameChange = (index: number, appId: string) => {
        const newRows = [...tableRows]
        newRows[index].appId = appId
        newRows[index].playTimeTrackedSec = gameWithTimeByAppId.get(appId)?.time
        newRows[index].desiredHours = ifNull(newRows[index].playTimeTrackedSec, 0) / 3600
        setTableRows(newRows)
    }

    const onDesiredHoursChange = (index: number, hours: string) => {
        const newRows = [...tableRows]
        newRows[index].desiredHours = Number.parseFloat(hours)
        setTableRows(newRows)
    }

    const isRowValid = (row: TableRowsProps) => {
        return (
            row.appId !== undefined &&
            row.desiredHours !== undefined &&
            row.desiredHours > 0 &&
            gameWithTimeByAppId.get(row.appId!) !== undefined
        )
    }

    const saveMigration = async () => {
        const gamesToMigrate = tableRows
            .filter((it) => isRowValid(it))
            .map((it) => {
                return {
                    game: gameWithTimeByAppId.get(it.appId!)?.game,
                    time: it.desiredHours! * 3600,
                } as GameWithTime
            })
        await timeMigration.applyManualOverallTimeCorrection(gamesToMigrate[0])
        navigateBack()
    }

    const rowCorrectnessClass = (row: TableRowsProps) => {
        return isRowValid(row)
            ? TableCSS.table__row_correct
            : TableCSS.table__row_not_correct
    }

    return (
        <PageWrapper>
            <Focusable style={{ height: '100%', overflow: 'scroll' }}>
                <PanelSection>
                    <ButtonItem layout="below" onClick={() => saveMigration()}>
                        Migrate
                    </ButtonItem>
                    <div style={TableCSS.table__container}>
                        <div
                            className="header-row"
                            style={{
                                gridTemplateColumns: '50% 25% 25%',
                                ...TableCSS.header__row,
                            }}
                        >
                            <div style={TableCSS.header__col}>Game</div>
                            <div style={TableCSS.header__col}>Tracked Time</div>
                            <div style={TableCSS.header__col}>Should be Hours</div>
                        </div>

                        {tableRows.map((row, idx) => (
                            <Focusable
                                flow-children="horizontal"
                                style={{
                                    gridTemplateColumns: '50% 25% 25%',
                                    ...TableCSS.table__row,
                                    ...rowCorrectnessClass(row),
                                }}
                            >
                                <div
                                    flow-children="vertical"
                                    style={{
                                        gridTemplateRows: '50% 50%',
                                        ...TableCSS.table_col,
                                    }}
                                >
                                    <div
                                        flow-children="horizontal"
                                        style={{
                                            gridTemplateColumns: '100% 0%',
                                            ...TableCSS.table__row,
                                        }}
                                    >
                                        <TextField
                                            onChange={(e) =>
                                                onSearchChange(idx, e.target.value)
                                            }
                                        />
                                        <FaSearch
                                            style={{
                                                position: 'relative',
                                                left: '-32px',
                                                top: '12px',
                                            }}
                                        />
                                    </div>
                                    <Dropdown
                                        rgOptions={gameOptions}
                                        selectedOption={row.appId}
                                        onChange={(e) => onGameChange(idx, e.data)}
                                    />
                                </div>
                                <div>
                                    {map(row.playTimeTrackedSec, (it) =>
                                        humanReadableTime(it)
                                    )}
                                </div>
                                <TextField
                                    mustBeNumeric
                                    value={row.desiredHours?.toFixed(2)?.toString()}
                                    onChange={(e) =>
                                        onDesiredHoursChange(idx, e.target.value)
                                    }
                                />
                            </Focusable>
                        ))}
                    </div>
                </PanelSection>
            </Focusable>
        </PageWrapper>
    )
}
