Ext.define("custom-grid-with-deep-export", {
    extend: 'Rally.app.App',
    componentCls: 'app',
    logger: new Rally.technicalservices.Logger(),
    layout: {
        type: 'vbox',
        align: 'stretch'
    },
    items: [{
        id: Utils.AncestorPiAppFilter.RENDER_AREA_ID,
        xtype: 'container',
        layout: {
            type: 'hbox',
            align: 'middle',
            defaultMargins: '0 10 10 0',
        }
    },
    {
        id: 'grid-area',
        xtype: 'container',
        flex: 1,
        type: 'vbox',
        align: 'stretch'
    }],
    config: {
        defaultSettings: {
            columnNames: ['FormattedID', 'Name', 'State'],
            // query: '(((State = "Idea Prioritization") OR (State = "Problem Discovery") OR (State = "Solution Discovery")))',
            showControls: true,
            type: 'PortfolioItem/Epic',
            pageSize: 50,
            enableUrlSharing: false
        }
    },

    integrationHeaders: {
        name: "custom-grid-with-deep-export"
    },

    disallowedAddNewTypes: ['user', 'userprofile', 'useriterationcapacity', 'testcaseresult', 'task', 'scmrepository', 'project', 'changeset', 'change', 'builddefinition', 'build', 'program'],
    orderedAllowedPageSizes: [10, 25, 50, 100, 200],
    readOnlyGridTypes: ['build', 'change', 'changeset'],
    statePrefix: 'customlist',
    allowExpansionStateToBeSaved: false,
    enableAddNew: false,
    onTimeboxScopeChange: function(newTimeboxScope) {
        this.callParent(arguments);
        this._buildStore();
    },
    launch: function() {
        this.ancestorFilterPlugin = Ext.create('Utils.AncestorPiAppFilter', {
            ptype: 'UtilsAncestorPiAppFilter',
            pluginId: 'ancestorFilterPlugin',
            settingsConfig: {
                //labelWidth: 150,
                //margin: 10
            },
            listeners: {
                scope: this,
                ready: function(plugin) {
                    Rally.data.util.PortfolioItemHelper.getPortfolioItemTypes().then({
                        scope: this,
                        success: function(portfolioItemTypes) {
                            this.portfolioItemTypes = _.sortBy(portfolioItemTypes, function(type) {
                                return type.get('Ordinal');
                            });

                            plugin.addListener({
                                scope: this,
                                select: this.viewChange
                            });
                            this.viewChange();
                        },
                        failure: function(msg) {
                            this._showError(msg);
                        },
                    })
                },
            }
        });
        this.addPlugin(this.ancestorFilterPlugin);
    },

    // Usual monkey business to size gridboards
    onResize: function() {
        console.log('onResize');
        this.callParent(arguments);
        var gridArea = this.down('#grid-area');
        var gridboard = this.down('rallygridboard');
        if (gridArea && gridboard) {
            gridboard.setHeight(gridArea.getHeight())
        }
    },
//////////////////////////////////////////////////////////////////////////////////////////////////

    _buildStore: function() {

        this.modelNames = [this.getSetting('type')];
        this.logger.log('_buildStore', this.modelNames);
        var fetch = ['FormattedID', 'Name','Project'];
        var dataContext = this.getContext().getDataContext();
        if (this.searchAllProjects()) {
            dataContext.project = null;
        }

        Ext.create('Rally.data.wsapi.TreeStoreBuilder').build({
            models: this.modelNames,
            enableHierarchy: true,
            enableRootLevelPostGet: true,
            remoteSort: true,
            fetch: fetch,
            context: dataContext
        }).then({
            success: this._addGridboard,
            scope: this
        });
    },
    _beforeLoadStore: function(store, operation, eOpts) {
        var _loadProjectsByMilestone =  function(milestone, subQuery){
            var artifacts = milestone.Artifacts;
            if (subQuery != undefined)
                var urlForArtifacts = artifacts._ref + "?start=1&pagesize=" + artifacts.Count + '&fetch=Project&query='+ encodeURI(subQuery);
            else 
                var urlForArtifacts = artifacts._ref + "?start=1&pagesize=" + artifacts.Count + '&fetch=Project'
            console.log(urlForArtifacts);
            var response = Ext.Ajax.request({
                async: false,
                url: urlForArtifacts,
                method: "GET",
            });
            if (response.status == 200){
                var responseTextObj = Ext.JSON.decode(response.responseText);
                var responseProjects = responseTextObj.QueryResult.Results;
                var queryForMilestone = "";
                for (var index = 0; index < responseProjects.length; index++) {
                    //// Project = "/project/1cfd4cf4-5bf7-476c-8c3d-f6a6b906a3b7"
                    const projectUUID = responseProjects[index].Project._refObjectUUID;
                    if (index == 0)
                    {
                        queryForMilestone = '(Project = "/project/'+projectUUID+'")';
                    }else{
                        queryForMilestone = '('+ queryForMilestone + '(Project = "/project/'+projectUUID+'"))';
                    }
                    
                    if (index < responseProjects.length -1){
                        queryForMilestone += " OR ";
                    }
                }
                return queryForMilestone;
            }else{
                return ""
            }
        };

        var _generateQueryForMilestones = function(urlSurfixForMilestone, subQuery){
            //console.log('https://rally1.rallydev.com/slm/webservice/v2.0/' + urlSurfixForMilestone);
            var response = Ext.Ajax.request({
                async: false,
                url: 'https://rally1.rallydev.com/slm/webservice/v2.0/' + urlSurfixForMilestone,
                method: "GET",
            });
            
            if (response.status == 200){
                var responseTextObj = Ext.JSON.decode(response.responseText);
                return _loadProjectsByMilestone(responseTextObj.Milestone, subQuery);
            }
            return "";
        }

        var _buildFiltersCollection = function(filterObj, collection) {
    
            if (filterObj.operator === 'AND') {
                collection.push ({
                    property: filterObj.value.property,
                    operator: filterObj.value.operator,
                    value: filterObj.value.value
                });
                return _buildFiltersCollection(filterObj.property, collection);
            }else{
                collection.push ({
                    property: filterObj.property,
                    operator: filterObj.operator,
                    value: filterObj.value
                });
                return collection;
            }
        }
        var typesForPortfolioItemType = 'portfolioitem/epic, portfolioitem/feature';
        var pageSize = Ext.clone(store.lastOptions.params.pagesize);
        if (operation.filters.length>0)
        {
            var filtersCollection = _buildFiltersCollection(operation.filters[0], []);
            var queryFilters = undefined;
            console.log(filtersCollection);
            var milestoneFilterValue = undefined;
            var milestoneQuery = undefined;
            var stateQuery = undefined;
            var portfolioItemTypeQuery = undefined;
            
            for (var index = 0; index < filtersCollection.length; index++) {
                const filter = filtersCollection[index];
                
                var query = "";
                if (filter.property == "Milestones"){
                    if (filter.operator.indexOf('?')== 0){
                        query = '(' + filter.property + ' ' + filter.operator.substring(1)+ ' "' + filter.value + '")';
                    }
                    else
                    { milestoneFilterValue = filter.value; continue;}
                }
                else{
                    
                    //this case can be considered as "State"
                    if (filter.operator == 'OR' || filter.operator == 'AND'){
                        query = '(' + filter.property + ' ' + filter.operator+ ' ' + filter.value + ' )';
                        stateQuery = query;
                    }
                    else{
                        query = '(' + filter.property + ' ' + filter.operator+ ' "' + filter.value + '")';
                        if (filter.property == 'State')
                            stateQuery = query;
                        else if (filter.property == 'PortfolioItemType.Name')
                            portfolioItemTypeQuery = query;
                            if (filter.value == 'Epic')
                            {
                                typesForPortfolioItemType = "portfolioitem/epic";
                            }else if(filter.value == 'Feature'){
                                typesForPortfolioItemType = "portfolioitem/feature";
                            }
                    }
                }
                if (query == "") continue;

                if (queryFilters == undefined)
                {
                    queryFilters = query
                }else{
                    if (query != "")
                        queryFilters = '('+ queryFilters + query + ')';
                }
                
                if (index < filtersCollection.length -1 ){
                    queryFilters += " AND ";
                }
            }
            if (milestoneFilterValue != undefined){
                var subQuery = undefined;
                if (stateQuery != undefined & portfolioItemTypeQuery != undefined)
                {
                    subQuery = '(' + stateQuery + ' AND ' + portfolioItemTypeQuery + ')';
                }else if( stateQuery != undefined){
                    subQuery = stateQuery;
                }else if ( portfolioItemTypeQuery != undefined){
                    subQuery = portfolioItemTypeQuery;
                }
                milestoneQuery = _generateQueryForMilestones(milestoneFilterValue, subQuery);
                if (milestoneQuery != '')
                {
                    if (queryFilters == '' || queryFilters == undefined)
                    {
                        queryFilters = milestoneQuery;
                    }
                    else {
                        queryFilters = '(' + queryFilters + (queryFilters.slice(-1) == ')' ? ' AND ' : '') + milestoneQuery + ')';
                    }
                }
                else
                {
                    queryFilters = queryFilters.slice(0, queryFilters.length - 4);  // remove 'AND'
                    queryFilters = ' ( FormattedID = 0 ) ';
                }
            }
             
            
            var startIndex = store.lastOptions.params.start;
            if (queryFilters != undefined && queryFilters != ""){
                var composedQuery =  queryFilters;
                Ext.apply(operation, {
                    params: {
                        query:composedQuery,
                        pagesize: pageSize,
                        start: startIndex,
                        types: typesForPortfolioItemType
                    }
               });
            } 
            
        } else {
            Ext.apply(operation, {
                params: {
                    types: typesForPortfolioItemType,
                    pagesize: pageSize,

                }
           });
        }
        console.log(operation);
        return;
    },
////////////////////////////////////////////////////////////////////////////////////////////////////    
    _addGridboard: function(store) {
        var gridArea = this.down('#grid-area')
        gridArea.removeAll();

        var currentModelName = this.modelNames[0];

        var filters = this.getSetting('query') ? [Rally.data.wsapi.Filter.fromQueryString(this.getSetting('query'))] : [];
        var timeboxScope = this.getContext().getTimeboxScope();
        if (timeboxScope && timeboxScope.isApplicable(store.model)) {
            filters.push(timeboxScope.getQueryFilter());
        }
        var ancestorFilter = this.ancestorFilterPlugin.getFilterForType(currentModelName);
        if (ancestorFilter) {
            filters.push(ancestorFilter);
        }
        store.on('beforeload', this._beforeLoadStore);
        this.logger.log('_addGridboard', store);

        var context = this.getContext();
        var dataContext = context.getDataContext();
        if (this.searchAllProjects()) {
            dataContext.project = null;
        }
        var summaryRowFeature = Ext.create('Rally.ui.grid.feature.SummaryRow');
        
        Ext.override(Rally.ui.inlinefilter.InlineFilterPanel, {
            minHeight: 46,
            padding: '8px 0 0 0',
            bodyPadding: '7px 5px 5px 5px',
            collapseDirection: 'top',
            collapsible: true,
            animCollapse: false,
    
            config: {
                inline: true,
                collapsed: true,
                anchorTargetCmp: undefined,
                model: undefined,
                context: undefined,
                quickFilterPanelConfig: {
                    initialFilters: [],
                    addQuickFilterConfig:{whiteListFields:["Milestones", "Tags"]
        }
                },
       advancedFilterPanelConfig: {
                    advancedFilterRowsConfig: {
                        propertyFieldConfig: {
                             whiteListFields: ["Milestones", "Tags"]
                        }
                     },
                    matchTypeConfig: {
                        value: 'AND'
                    }
                }
            },
        }
        );
        
        this.gridboard = gridArea.add({
            xtype: 'rallygridboard',
            context: context,
            modelNames: this.modelNames,
            toggleState: 'grid',
            height: gridArea.getHeight()-10,
            originHeight: undefined,
            listeners: {
                scope: this,
                viewchange: this.viewChange,
            },
            plugins: [
                'rallygridboardaddnew',
                // {
                //     ptype: 'rallygridboardinlinefiltercontrol',
                //     inlineFilterButtonConfig: {
                //         stateful: true,
                //         stateId: this.getModelScopedStateId(currentModelName, 'filters'),
                //         modelNames: this.modelNames,
                //         inlineFilterPanelConfig: {
                //             // quickFilterPanelConfig: {
                //             //     whiteListFields: [
                //             //        'Tags',
                //             //        'Milestones'
                //             //     ],
                //             //     defaultFields: [
                //             //         'Milestones',
                //             //         'Project'
                //             //     ]
                //             // },
                //             advancedFilterPanelConfig: {
                //                 matchTypeConfig: {
                //                     value: 'AND'
                //                 },                
                //                 advancedFilterRowsConfig: {
                //                     propertyFieldConfig: {
                //                         blackListFields: [
                //                             'Tags',
                //                             'Milestones'
                //                         ],
                //                     }
                //                 }
                //             }
                            
                //         }
                //     }
                // },
                {
                    ptype: 'rallygridboardcustomfiltercontrol',
                    inlineFilterButtonConfig: {
                        stateful: true,
                        stateId: this.getModelScopedStateId(currentModelName, 'customfilters'),
                        modelNames: this.modelNames,
                    }
                },
                {
                    ptype: 'rallygridboardfieldpicker',
                    headerPosition: 'left',
                    modelNames: this.modelNames,
                    stateful: true,
                    stateId: this.getModelScopedStateId(currentModelName, 'fields')
                },
                {
                    ptype: 'rallygridboardactionsmenu',
                    menuItems: this._getExportMenuItems(),
                    buttonConfig: {
                        iconCls: 'icon-export'
                    }
                },
                {
                    ptype: 'rallygridboardsharedviewcontrol',
                    sharedViewConfig: {
                        enableUrlSharing: this.getSetting('enableUrlSharing'),
                        stateful: true,
                        stateId: this.getModelScopedStateId(currentModelName, 'views'),
                        stateEvents: ['select', 'beforedestroy']
                    },
                }
            ],
            cardBoardConfig: {
                attribute: 'State'
            },
            gridConfig: {
                store: store,
                storeConfig: {
                    filters: filters,
                    context: dataContext
                },
                columnCfgs: [
                    'Name',
                    'State',
                    'Milestones',
                    'PlannedStartDate',
                    'PlannedEndDate',
                    'Parent',
                    'c_PriorityCategorization',
                    'Project'
                    /*
                    {
                        dataIndex: 'State',
                        summaryType: 'sum'
                    },
                    {
                        dataIndex: 'Milestones',
                        summaryType: 'sum'
                    },
                    {
                        dataIndex: 'Owner',
                        summaryType: 'sum'
                    }
                    */
                ],
                features: [summaryRowFeature]
            }
        });
    },

    viewChange: function() {
        this._buildStore();
    },
    

    getModelScopedStateId: function(modelName, id) {
        return this.getContext().getScopedStateId(modelName + '-' + id);
    },

    _getExportMenuItems: function() {
        var result = [];
        this.logger.log('_getExportMenuItems', this.modelNames[0]);
        var currentModel = this.modelNames[0].toLowerCase();
        if (currentModel === 'hierarchicalrequirement') {
            result = [{
                text: 'Export User Stories...',
                handler: this._export,
                scope: this,
                childModels: ['hierarchicalrequirement']
            }, /* {
                text: 'Export User Stories and Tasks...',
                handler: this._export,
                scope: this,
                childModels: ['hierarchicalrequirement', 'task']
            }, */ {
                text: 'Export User Stories and Defects...',  //  Child Items
                handler: this._export,
                scope: this,
                childModels: ['hierarchicalrequirement', 'defect'] // , 'task', 'testcase'    removing tasks, test cases
            }];
        }
        else if (Ext.String.startsWith(currentModel,"portfolioitem")) {
            var piTypeNames = this.getPortfolioItemTypeNames();
            var idx = _.indexOf(piTypeNames, currentModel);
            var childModels = [];
            if (idx > 0) {
                for (var i = idx; i > 0; i--) {
                    childModels.push(piTypeNames[i - 1]);
                }
            }

            result = [{
                text: 'Export Portfolio Items...',
                handler: this._export,
                scope: this,
                childModels: childModels
            },/* {
                text: 'Export Portfolio Items and User Stories...',
                handler: this._export,
                scope: this,
                childModels: childModels.concat(['hierarchicalrequirement'])
            }, {
                text: 'Export Portfolio Items, User Stories and Tasks...',
                handler: this._export,
                scope: this,
                childModels: childModels.concat(['hierarchicalrequirement', 'task'])
            }, {
                text: 'Export Portfolio Items, Stories and Defects...',   // Child Item
                handler: this._export,
                scope: this,
                childModels: childModels.concat(['hierarchicalrequirement', 'defect']) //  , 'task', 'testcase'
            }*/];
        }
        else if (currentModel == 'defect') {
            result = [{
                text: 'Export Defects...',
                handler: this._export,
                scope: this,
                childModels: []
            }, {
                text: 'Export Defects and Child Items...',
                handler: this._export,
                scope: this,
                childModels: ['defect']  //  , 'task', 'testcase'
            }];
        }
  /*      else if (currentModel == 'testcase') {
            result = [{
                text: 'Export Test Cases...',
                handler: this._export,
                scope: this,
                childModels: []
            }, {
                text: 'Export Test Cases and Child Items...',
                handler: this._export,
                scope: this,
                childModels: ['defect', 'task', 'testcase']
            }];
        }  */
        else {
            result = [{
                text: 'Export to CSV...',
                handler: this._export,
                scope: this,
                childModels: []
            }];
        }

        return result;
    },
    getPortfolioItemTypeNames: function() {
        return _.map(this.portfolioItemTypes, function(type) {
            return type.get('TypePath').toLowerCase();
        });
    },

    _showError: function(msg) {
        Rally.ui.notify.Notifier.showError({ message: msg });
    },
    _showStatus: function(message) {
        this.logger.log('_showstatus', message, this);
        if (message) {
            Rally.ui.notify.Notifier.showStatus({
                message: message,
                showForever: true,
                closable: false,
                animateShowHide: false
            });
        }
        else {
            Rally.ui.notify.Notifier.hide();
        }
    },
    _getExportColumns: function() {
        var grid = this.down('rallygridboard').getGridOrBoard();
        if (grid) {
            return _.filter(grid.columns, function(item) {
                return (
                    item.dataIndex &&
                    item.dataIndex != "DragAndDropRank" &&
                    item.xtype &&
                    item.xtype != "rallytreerankdraghandlecolumn" &&
                    item.xtype != "rallyrowactioncolumn" &&
                    item.text != "&#160;");
            });
        }
        return [];
    },
    _getExportFilters: function() {
        var grid = this.down('rallygridboard'),
            filters = [],
            query = this.getSetting('query');

        if (grid.currentCustomFilter && grid.currentCustomFilter.filters) {
            // Concat any current custom filters (don't assign as we don't want to modify the currentCustomFilter array)
            filters = filters.concat(grid.currentCustomFilter.filters);
        }

        if (query) {
            filters.push(Rally.data.wsapi.Filter.fromQueryString(query));
        }

        var timeboxScope = this.getContext().getTimeboxScope();
        if (timeboxScope && timeboxScope.isApplicable(grid.getGridOrBoard().store.model)) {
            filters.push(timeboxScope.getQueryFilter());
        }

        var ancestorFilter = this.ancestorFilterPlugin.getFilterForType(this.modelNames[0]);
        if (ancestorFilter) {
            filters.push(ancestorFilter);
        }
        return filters;
    },
    _getExportFetch: function() {
        var fetch = _.pluck(this._getExportColumns(), 'dataIndex');
        if (Ext.Array.contains(fetch, 'TaskActualTotal')) {
            fetch.push('Actuals');
        }
        return fetch;
    },
    _getExportSorters: function() {
        return this.down('rallygridboard').getGridOrBoard().getStore().getSorters();
    },
    _export: function(args) {
        var columns = this._getExportColumns(),
            fetch = this._getExportFetch(),
            filters = this._getExportFilters(),
            modelName = this.modelNames[0],
            childModels = args.childModels,
            sorters = this._getExportSorters();

        this.logger.log('_export', fetch, args, columns, filters.toString(), childModels, sorters);

        var exporter = Ext.create('Rally.technicalservices.HierarchyExporter', {
            modelName: modelName,
            fileName: 'hierarchy-export.csv',
            columns: columns,
            portfolioItemTypeObjects: this.portfolioItemTypes

        });
        exporter.on('exportupdate', this._showStatus, this);
        exporter.on('exporterror', this._showError, this);
        exporter.on('exportcomplete', this._showStatus, this);

        var dataContext = this.getContext().getDataContext();
        if (this.searchAllProjects()) {
            dataContext.project = null;
        }
        
        var hierarchyLoader = Ext.create('Rally.technicalservices.HierarchyLoader', {
            model: modelName,
            fetch: fetch,
            filters: filters,
            sorters: sorters,
            loadChildModels: childModels,
            portfolioItemTypes: this.portfolioItemTypes,
            context: dataContext
        });
        hierarchyLoader.on('statusupdate', this._showStatus, this);
        hierarchyLoader.on('hierarchyloadartifactsloaded', exporter.setRecords, exporter);
        hierarchyLoader.on('hierarchyloadcomplete', exporter.export, exporter);
        hierarchyLoader.on('hierarchyloaderror', this._showError, this)
        hierarchyLoader.load();
    },
    getHeight: function() {
        var el = this.getEl();
        if (el) {
            var height = this.callParent(arguments);
            return Ext.isIE8 ? Math.max(height, 600) : height;
        }

        return 0;
    },

    setHeight: function(height) {
        console.log('setHeight(height)');
        this.callParent(arguments);
        if (this.gridboard) {
            this.gridboard.setHeight(height);
        }
    },
    getOptions: function() {
        return [{
            text: 'About...',
            handler: this._launchInfo,
            scope: this
        }];
    },

    _launchInfo: function() {
        if (this.about_dialog) { this.about_dialog.destroy(); }
        this.about_dialog = Ext.create('Rally.technicalservices.InfoLink', {});
    },

    isExternal: function() {
        return typeof(this.getAppId()) == 'undefined';
    },

    searchAllProjects: function() {
        return this.ancestorFilterPlugin.getIgnoreProjectScope();
    },

    getSettingsFields: function() {
        return Rally.technicalservices.CustomGridWithDeepExportSettings.getFields();
    }
});
