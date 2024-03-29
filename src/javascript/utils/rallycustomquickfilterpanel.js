Ext.define('Rally.ui.inlinefilter.CustomQuickFilterPanel', {
    extend: 'Ext.panel.Panel',
    alias: 'widget.rallycustomquickfilterpanel',
    requires: [
        'Rally.ui.popover.FieldPopover',
        'Rally.ui.inlinefilter.FilterFieldFactory',
        'Rally.ui.inlinefilter.ToggleAdvancedButton',
        'Rally.ui.picker.ModelTypePicker',
        'Rally.data.ModelTypes',
        'Rally.data.wsapi.Filter',
        'Rally.data.wsapi.ModelBuilder',
        'Rally.util.DateTime',
        'Rally.util.Ref'
    ],
    mixins: [
        'Rally.clientmetrics.ClientMetricsRecordable',
        'Rally.app.Scopeable'
    ],
    padding: '0 0 0 0',
    bodyPadding: '7px 5px 5px 5px',
    collapseDirection: 'top',
    border: false,
    stateful: true,
    cls: 'inline-filter-panel',
    layout: 'column',
    bubbleEvents: ['filterchange'],
    config: {
        autoExpand: false,
        model: undefined,
        context: undefined,
        matchType: 'AND',
        defaultFields: [],
        fields: [],
        initialTypes: [],
        initialFilters: [],
        toggleAdvancedButtonConfig: {},
        addQuickFilterConfig: {}
    },

    initComponent: function() {
        this.items = this._getItems();
        this.callParent(arguments);
    },

    getTypes: function() {
        var modelTypePicker = _.find(this.fields, {name: 'ModelType'});        
        return modelTypePicker ? modelTypePicker.getValue() : [];
    },

    getTypesFilter: function() {
        var types = this.getTypes(),
            filterIndex = _.findIndex(this.fields, {name: 'ModelType'}) + 1;

        return Ext.isEmpty(types) ? null :
            Ext.apply(Rally.data.wsapi.Filter.or(_.map(types, function(type) {
                var typeDefOid = this.model.getArtifactComponentModel(type).typeDefOid;
                return {
                    property: 'TypeDefOid',
                    operator: '=',
                    value: typeDefOid
                };
            }, this)), {
                filterIndex: filterIndex
            });
    },

    generateFilter: function(field, lastValue, index){
        var isRefUri = Rally.util.Ref.isRefUri(lastValue);
        var isRefOid = _.isNumber(Rally.util.Ref.getOidFromRef(lastValue));
        if (isRefUri && isRefOid && field.valueField === '_ref' && field.noEntryValue !== lastValue) {
            var record = field.getRecord();
            if (record) {
                var uuidRef = record.get('_uuidRef');
                if (uuidRef) {
                    lastValue = uuidRef;
                }
            }
        }

        var filter = _.isFunction(field.getFilter) ? field.getFilter() : Rally.data.wsapi.Filter.fromExtFilter({
            property: field.name,
            operator: field.operator,
            value: lastValue
        });

        if(filter) {

            if (field.allowNoEntry && field.noEntryValue === lastValue) {
                filter.value = null;
            }

            Ext.apply(filter, {
                name: field.name,
                rawValue: lastValue,
                filterIndex: index + 1
            });
            
            return filter;
        }
        return null;
    },

    getFilters: function() {
        
        var filters = [];
        _.each(this.fields, function(field, index) {
            if (field.name === 'ModelType') {
                return;
            }
            
            if (!Ext.isEmpty(field.lastValue) && !field.hasActiveError()) {
                if (Array.isArray(field.lastValue)){
                    var lastValues = field.lastValue;
                    var multipleSelectFilter = null;
                    for (var index = 0; index < lastValues.length; index++) {
                        var lastValue = lastValues[index];
                        var filter = this.generateFilter(field, lastValue, index);
                        if (filter){
                            if (multipleSelectFilter)
                                multipleSelectFilter = multipleSelectFilter.or(filter);
                            else
                                multipleSelectFilter = filter;
                        }
                    }
                    filters.push(multipleSelectFilter);
                }else{
                    var lastValue = field.lastValue;
                    var filter = this.generateFilter(field, lastValue, index);
                    if (filter);
                        filters.push(filter);
                }

                
            }
        }, this);        
        return filters;
    },

    clear: function() {
        _.each(this.fields, function(field) {
            field.originalValue = undefined;
            field.reset();
        }, this);
    },

    clearInvalidFields: function () {
        _.each(this.fields, function(field){
            if (!field.isValid()) {
                field.reset();
            }
        });
    },

    getSelectedFields: function() {
        return _.map(this.fields, 'name');
    },

    _getItems: function() {        
        this._createToggleAdvancedButton();
        this._createAddQuickFilterButton();
        
        return [].concat(this.addQuickFilterButton, this.toggleAdvancedButton);
    },

    _getOperatorForModelField: function(modelField) {
        var operator = '=';

        if (modelField && modelField.isCollection && modelField.isCollection()) {
            operator = 'contains';
        }

        return operator;
    },
    _createPortfolioItemTypeField: function(filterIndex, field, initialValues, addtitionalConfig, cboState) {
        var fieldName = field.name || field,
            modelField = this.model.getField(fieldName),
            fieldConfig = Rally.ui.inlinefilter.FilterFieldFactory.getFieldConfig(this.model, fieldName, this.context),
            initialValue = initialValues && initialValues[fieldConfig.name] && initialValues[fieldConfig.name].rawValue;

        if (modelField && modelField.isDate() && initialValue) {
            initialValue = Rally.util.DateTime.fromIsoString(initialValue);
        }

        initialValue = Rally.ui.inlinefilter.FilterFieldFactory.getInitialValueForLegacyFilter(fieldConfig, initialValue);
        // fieldConfig = Rally.ui.inlinefilter.FilterFieldFactory.getFieldConfigForLegacyFilter(fieldConfig, initialValue);
        fieldConfig = {};

        Ext.applyIf(fieldConfig, {
            // allowClear: true
        });
        
        Ext.merge(fieldConfig, {
            xtype: 'rallycombobox',
            store: Ext.create('Ext.data.Store', {
                fields: ['abbr', 'name'],
                data : [
                    {"abbr":"Epic", "name":"Epic"},
                    {"abbr":"Feature", "name":"Feature"},
                ]
            }),
            name: 'PortfolioItemType.Name',
            queryMode: 'local',
            displayField: 'name',
            valueField: 'abbr',
            autoExpand: this.autoExpand,
            // clearText: '-- Clear Filter --',
            allowNoEntry: true,
            emptyText: 'Filter by PortfolioItem Type',
            labelAlign: 'right',
            labelWidth: 150,
            width: 250,
            labelSeparator: '',
            enableKeyEvents: true,
            hideLabel: false,
            margin: 0,
            cls: this.isCustomMatchType() ? 'indexed-field' : '',
            beforeLabelTextTpl: [
                '<span class="filter-index">{[this.getFilterIndex()]}</span>',
                {
                    filterIndex: filterIndex,
                    displayIndex: this.isCustomMatchType(),
                    getFilterIndex: function() {
                        return this.displayIndex ? Ext.String.format('({0}) ', this.filterIndex) : '';
                    }
                }
            ],
            context: this.context,
            operator: this._getOperatorForModelField(modelField),
        });
        Ext.merge(fieldConfig, addtitionalConfig);

        if (_.isPlainObject(field)) {
            Ext.apply(fieldConfig, field);
        }

        if (filterIndex === 1) {
            fieldConfig.itemId = this.self.FOCUS_CMP_ITEM_ID;
        }

        
        Ext.merge(fieldConfig, {
            listeners: {
                change : function(me, newValue, oldValue, eOpts){
                    var portfolioItemTypeFilter = undefined;
                    // this._applyFilters();
                    if (newValue != null){
                        portfolioItemTypeFilter = Ext.create('Rally.data.wsapi.Filter', {
                            property: 'Typedef.Name',
                            operation: '=',
                            value: newValue
                        });
                        cboState.getStore().clearFilter(true);
                        cboState.getStore().filter([portfolioItemTypeFilter]);
                        cboState.getStore().load();
                    }else{
                        cboState.setValue(null);
                        cboState.getStore().removeAll();
                    }
                },
                scope: this
            }
        });

        return Ext.widget(fieldConfig);
    },
    _createCustomCheckboxField: function(fieldConfig, change_func, activate_func) {
        Ext.merge(fieldConfig, {
            xtype: 'checkbox',
            listeners: {
                change : function(me, newValue, oldValue, eOpts){
                    if (change_func !== null)
                        change_func(newValue);
                    // this._applyFilters();
                },
                render : function(){
                    if (activate_func !== null)
                        activate_func();
                },
                scope: this
            }
        });
        return Ext.widget(fieldConfig);
    },

    _createClearFiltersButton: function(buttonConfig, cboState, cboArtifact, cboMilestones, cboPrimaryMilestones, chkIsPrimaryMlestone){
        Ext.merge(buttonConfig, {
            xtype: 'button',
            cls: 'toggle-advanced-button rly-small secondary',
            pressedCls: 'apply-pressed',
            margin: '10,0,0,0',
            listeners: {
                click : function(me, e, eOpts){

                    // cboState.setValue(null);
                    // cboState.getStore().removeAll();
                    // cboMilestones.setValue(null);
                    // cboMilestones.getStore().removeAll();
                    // cboPrimaryMilestones.setValue(null);
                    // cboPrimaryMilestones.getStore().removeAll();
                    // cboArtifact.setValue(null);
                    // chkIsPrimaryMlestone.setValue(false);
                    this._applyFilters();
                },
                scope: this
            }
        });
        return Ext.widget(buttonConfig);
    },
    _createCustomComboField: function(filterIndex, field, initialValues, addtitionalConfig, name, emptyText) {
        
        var fieldName = field.name || field,
            modelField = this.model.getField(fieldName),
            fieldConfig = Rally.ui.inlinefilter.FilterFieldFactory.getFieldConfig(this.model, fieldName, this.context),
            initialValue = initialValues && initialValues[fieldConfig.name] && initialValues[fieldConfig.name].rawValue;

        if (modelField && modelField.isDate() && initialValue) {
            initialValue = Rally.util.DateTime.fromIsoString(initialValue);
        }

        initialValue = Rally.ui.inlinefilter.FilterFieldFactory.getInitialValueForLegacyFilter(fieldConfig, initialValue);
        // fieldConfig = Rally.ui.inlinefilter.FilterFieldFactory.getFieldConfigForLegacyFilter(fieldConfig, initialValue);
        fieldConfig = {};

        Ext.applyIf(fieldConfig, {
            // allowClear: true
        });


        Ext.merge(fieldConfig, {
            xtype: 'rallycombobox',
            name: name,
            displayField: 'Name',
            valueField: '_ref',
            autoExpand: this.autoExpand,
            // clearText: '-- Clear Filter --',
            allowNoEntry: true,
            emptyText: emptyText,
            labelAlign: 'right',
            labelSeparator: '',
            enableKeyEvents: true,
            hideLabel: false,
            margin: 0,
            cls: this.isCustomMatchType() ? 'indexed-field' : '',
            beforeLabelTextTpl: [
                '<span class="filter-index">{[this.getFilterIndex()]}</span>',
                {
                    filterIndex: filterIndex,
                    displayIndex: this.isCustomMatchType(),
                    getFilterIndex: function() {
                        return this.displayIndex ? Ext.String.format('({0}) ', this.filterIndex) : '';
                    }
                }
            ],
            context: null,
            operator: this._getOperatorForModelField(modelField),
        });
        Ext.merge(fieldConfig, addtitionalConfig);

        if (_.isPlainObject(field)) {
            Ext.apply(fieldConfig, field);
        }

        if (filterIndex === 1) {
            fieldConfig.itemId = this.self.FOCUS_CMP_ITEM_ID;
        }

        // if (this._shouldApplyFiltersOnSelect(fieldConfig)) {
        //     Ext.merge(fieldConfig, {
        //         autoSelect: false,
        //         listeners: {
        //             select: this._applyFilters,
        //             scope: this
        //         }
        //     });
        // } else {
        //     Ext.merge(fieldConfig, {
        //         listeners: {
        //             change: this._applyFilters,
        //             scope: this
        //         }
        //     });
        // }       

        return Ext.widget(fieldConfig);
    },
    _createField: function(filterIndex, field, initialValues, addtitionalConfig) {
        var fieldName = field.name || field,
            modelField = this.model.getField(fieldName),
            fieldConfig = Rally.ui.inlinefilter.FilterFieldFactory.getFieldConfig(this.model, fieldName, this.context),
            initialValue = initialValues && initialValues[fieldConfig.name] && initialValues[fieldConfig.name].rawValue;

        if (modelField && modelField.isDate() && initialValue) {
            initialValue = Rally.util.DateTime.fromIsoString(initialValue);
        }

        initialValue = Rally.ui.inlinefilter.FilterFieldFactory.getInitialValueForLegacyFilter(fieldConfig, initialValue);
        fieldConfig = Rally.ui.inlinefilter.FilterFieldFactory.getFieldConfigForLegacyFilter(fieldConfig, initialValue);

        Ext.applyIf(fieldConfig, {
            allowClear: true
        });

        
        Ext.merge(fieldConfig, {
            autoExpand: this.autoExpand,
            allowBlank: true,
            clearText: '-- Clear Filter --',
            labelAlign: 'right',
            labelSeparator: '',
            enableKeyEvents: true,
            hideLabel: false,
            margin: 0,
            cls: this.isCustomMatchType() ? 'indexed-field' : '',
            beforeLabelTextTpl: [
                '<span class="filter-index">{[this.getFilterIndex()]}</span>',
                {
                    filterIndex: filterIndex,
                    displayIndex: this.isCustomMatchType(),
                    getFilterIndex: function() {
                        return this.displayIndex ? Ext.String.format('({0}) ', this.filterIndex) : '';
                    }
                }
            ],
            model: this.model,
            context: this.context,
            operator: this._getOperatorForModelField(modelField),            
        });
        Ext.merge(fieldConfig, addtitionalConfig);

        if (!_.isUndefined(initialValue)) {
            Ext.merge(fieldConfig, {
                value: initialValue
            });
        }

        if (_.isPlainObject(field)) {
            Ext.apply(fieldConfig, field);
        }

        if (filterIndex === 1) {
            fieldConfig.itemId = this.self.FOCUS_CMP_ITEM_ID;
        }

        return Ext.widget(fieldConfig);
    },

    _createMilestoneComboField: function(filterIndex, field, initialValues, addtitionalConfig, name) {
        var fieldName = field.name || field,
            modelField = this.model.getField(fieldName),
            fieldConfig = Rally.ui.inlinefilter.FilterFieldFactory.getFieldConfig(this.model, fieldName, this.context),
            initialValue = initialValues && initialValues[fieldConfig.name] && initialValues[fieldConfig.name].rawValue;

        if (modelField && modelField.isDate() && initialValue) {
            initialValue = Rally.util.DateTime.fromIsoString(initialValue);
        }

        initialValue = Rally.ui.inlinefilter.FilterFieldFactory.getInitialValueForLegacyFilter(fieldConfig, initialValue);
        fieldConfig = Rally.ui.inlinefilter.FilterFieldFactory.getFieldConfigForLegacyFilter(fieldConfig, initialValue);

        Ext.applyIf(fieldConfig, {
            allowClear: true
        });
        
        Ext.merge(fieldConfig, {
            xtype: 'rallycustommilestonecombobox',
            name: name,
            autoExpand: this.autoExpand,
            allowBlank: true,
            clearText: '-- Clear Filter --',
            labelAlign: 'right',
            listConfig: {
                minWidth: 385,
                cls: 'milestone-list',
                emptyText: 'No Milestones Defined',
                itemTpl: Ext.create('Ext.XTemplate',
                    '<div>',
                        "<tpl if='Name != \"\"'>{Name} ({FormattedID})</tpl>",
                        "<tpl if='Name == \"\"'>-- Clear Filter --</tpl>",
                    '</div>'
                    // '<div class="milestone-date">{[Rally.util.DateTime.formatWithDefault(values.TargetDate)]}</div>',
                    // '<div class="milestone-raw-date">{TargetDate}</div>'
                )
            },
            storeConfig :{
                remoteSort: true,
            },
            queryMode: 'local',
            labelSeparator: '',
            enableKeyEvents: true,
            hideLabel: false,
            margin: 0,
            cls: this.isCustomMatchType() ? 'indexed-field' : '',
            beforeLabelTextTpl: [
                '<span class="filter-index">{[this.getFilterIndex()]}</span>',
                {
                    filterIndex: filterIndex,
                    displayIndex: this.isCustomMatchType(),
                    getFilterIndex: function() {
                        return this.displayIndex ? Ext.String.format('({0}) ', this.filterIndex) : '';
                    }
                }
            ],
            model: this.model,
            context: this.context,
            operator: this._getOperatorForModelField(modelField),
        });
        Ext.merge(fieldConfig, addtitionalConfig);

        if (!_.isUndefined(initialValue)) {
            Ext.merge(fieldConfig, {
                value: initialValue
            });
        }

        if (_.isPlainObject(field)) {
            Ext.apply(fieldConfig, field);
        }

        if (filterIndex === 1) {
            fieldConfig.itemId = this.self.FOCUS_CMP_ITEM_ID;
        }        
        return Ext.widget(fieldConfig);
    },

    focusFirstField: function() {
        var focusCmp = _.first(this.fields);
        if (focusCmp) {
            focusCmp.focus(true);
        }
    },

    _removeQuickFilter: function(field) {
        this.recordAction({
            description: 'quick filter removed',
            miscData: {
                field: field.name || field
            }
        });
        var arrayIndex = field.beforeLabelTextTpl.filterIndex - 1;
        this.fields[arrayIndex].destroy();
        this.fields.splice(arrayIndex, 1);
        this.updateFilterIndices();
        this.fireEvent('quickfilterchange', field, this);
    },

    _shouldApplyFiltersOnSelect: function(fieldConfig) {
        var field = this.model.getField(fieldConfig.name),
            attributeDefinition = field && field.attributeDefinition;

        return attributeDefinition &&
            (attributeDefinition.Constrained || attributeDefinition.AttributeType === 'OBJECT') &&
            !fieldConfig.multiSelect;
    },

    _onMatchTypeChange: function(matchType) {
        this.updateFilterIndices(matchType.getValue());
    },

    isCustomMatchType: function() {
        return this.matchType === 'CUSTOM';
    },

    updateFilterIndices: function(matchType) {
        this.matchType = matchType || this.matchType;

        _.each(this.fields, function (field, index) {
            field.beforeLabelTextTpl.displayIndex = this.isCustomMatchType();
            field.beforeLabelTextTpl.filterIndex = index + 1;
            field.beforeLabelTextTpl.overwrite(field.labelEl.down('.filter-index'));
            if (this.isCustomMatchType()) {
                field.addCls('indexed-field');
            } else {
                field.removeCls('indexed-field');
            }
            if (Ext.isIE10m && field.inputEl) {
                field.setValue(field.getValue());
            }
        }, this);
    },

    _applyFilters: function() {
        this.fireEvent('filterchange', this);
    },

    _createToggleAdvancedButton: function() {
        this.toggleAdvancedButton = Ext.widget(Ext.merge({
            xtype: 'rallytoggleadvancedbutton',
            listeners: {
                click: this._onToggleAdvanced,
                scope: this
            }
        }, this.toggleAdvancedButtonConfig));
    },

    _createAddQuickFilterButton: function() {
        var currentPanel = this;
        

        var primaryMilestoneStore =  Ext.create('Rally.data.wsapi.Store', {
            model: "Milestone",
            filters: [
                Ext.create('Rally.data.wsapi.Filter', {
                    property: 'c_PrimaryMilestoneFlag',
                    operation: '=',
                    value: 'True'
                }),
                Rally.data.wsapi.Filter.or([
                    {
                        property: 'Projects',
                        operator: 'contains',
                        value: Rally.util.Ref.getRelativeUri(this.getProjectRef())
                    }, {
                        property: 'TargetProject',
                        operator: '=',
                        value: null
                    }
                ])
            ],
            sorters: [
                {
                    property: 'Name',
                    direction: 'Asc'
                }
            ],
            context: null,
            listeners: {
                load: function(me, data, success){
                    currentPanel.unmask();
                    Rally.technicalservices.CustomGridWithDeepExportSettings.primaryMilestones = data;
                    cboPrimaryMilestones.store.loadData(Rally.technicalservices.CustomGridWithDeepExportSettings.primaryMilestones);
                    cboPrimaryMilestones.originData = Rally.technicalservices.CustomGridWithDeepExportSettings.primaryMilestones;
                }
            }
       });

       var milestoneStore =  Ext.create('Rally.data.wsapi.Store', {
        model: "Milestone",
        filters: [
            Rally.data.wsapi.Filter.or([
                {
                    property: 'Projects',
                    operator: 'contains',
                    value: Rally.util.Ref.getRelativeUri(this.getProjectRef())
                }, {
                    property: 'TargetProject',
                    operator: '=',
                    value: null
                }
            ])
        ],
        sorters: [
            {
                property: 'Name',
                direction: 'Asc'
            }
        ],
        context: null,
        listeners: {
            load: function(me, data, success){
                currentPanel.unmask();
                Rally.technicalservices.CustomGridWithDeepExportSettings.milestones = data;
                cboMilestones.store.loadData(Rally.technicalservices.CustomGridWithDeepExportSettings.milestones);
                cboMilestones.originData = Rally.technicalservices.CustomGridWithDeepExportSettings.milestones;
            }
        }
   });


       var primaryMilestoneStoreForCombo =  Ext.create('Ext.data.Store', {
            fields: ['_ref', 'Name'],
            data: [],
            queryMode: 'local',
        });

        var milestoneStoreForCombo =  Ext.create('Ext.data.Store', {
            fields: ['_ref', 'Name'],
            data: [],
            queryMode: 'local',
        });


        var primaryMileStoneFilterConfig = {
            width: 260,
            labelWidth: 110,
            fieldLabel: 'Primary Milestone',
            queryMode: 'local',
            disabled: true,
            store: primaryMilestoneStoreForCombo,
            listeners: {
                enable: function(me, eOpts){
                    if (Rally.technicalservices.CustomGridWithDeepExportSettings.primaryMilestones != undefined)
                        me.getStore().loadData(Rally.technicalservices.CustomGridWithDeepExportSettings.primaryMilestones);
                },
                disable: function(me, eOpts){
                    me.setValue(null);
                    me.getStore().removeAll();
                }
           }
        };
        var milestoneFilterConfig = {
            width: 300,
            labelWidth: 150,
            fieldLabel: 'Milestone',
            queryMode: 'local',
            store: milestoneStoreForCombo,
            listeners: {
                enable: function(me, eOpts){
                    if (Rally.technicalservices.CustomGridWithDeepExportSettings.milestones != undefined)
                        me.getStore().loadData(Rally.technicalservices.CustomGridWithDeepExportSettings.milestones);
                },
                disable: function(me, eOpts){
                    me.setValue(null);
                    me.getStore().removeAll();
                }
           }
        };
        var stateFilterConfig = {
            width: 300,
            labelWidth: 150,
            fieldLabel: 'State',
            multiSelect: true,
            store : Ext.create('Rally.data.wsapi.Store', {
                model: "State",
                sorters: [
                    {
                        property: 'OrderIndex',
                        direction: 'ASC'
                    }
                ],
                context: null
           })
        };
        var artifactFilterConfig = {
            width: 300,
            labelWidth: 150,
            fieldLabel: 'PortfolioItem Type',
        };

        var isPrimaryFilterConfig = {
            width: 200,
            margin: '0, 0, 0, 10',
            name: 'IsPrimaryMilestone',
            boxLabel: 'Is Primary Milestone',
            boxLabelAlign: 'after'
        };

        var chkIsPrimaryMlestone_OnActivate = function(val){
            if (Rally.technicalservices.CustomGridWithDeepExportSettings.milestones  == undefined){
                currentPanel.mask('Loading Milestones...');
                milestoneStore.load();
            }
        };

        var chkIsPrimaryMlestone_OnChange = function(val){
            cboMilestones.setDisabled(val)
            cboPrimaryMilestones.setDisabled(!val);
            if (val){
                if (Rally.technicalservices.CustomGridWithDeepExportSettings.primaryMilestones  == undefined){
                    currentPanel.mask('Loading Primary Milestones...');
                    primaryMilestoneStore.load();
                }
            }else{
                if (Rally.technicalservices.CustomGridWithDeepExportSettings.milestones  == undefined){
                    currentPanel.mask('Loading Milestones...');
                    milestoneStore.load();
                }
            }

        };
        var clearFilterButtonConfig = {
            margin : '150,0,0,0',
            text: 'Apply'
        }

        var cboState = this._createCustomComboField(1, 'State', null, stateFilterConfig, 'State', 'Filter By State');
        var cboArtifact = this._createPortfolioItemTypeField(0, 'PortfolioItemType', null, artifactFilterConfig, cboState);
        var cboMilestones = this._createMilestoneComboField(2, 'Milestones', null, milestoneFilterConfig, 'Milestones');
        var cboPrimaryMilestones = this._createMilestoneComboField(3, 'Milestones', null, primaryMileStoneFilterConfig, 'PrimaryMilestone', 'Filter By Primary Milestone');
        var chkIsPrimaryMlestone = this._createCustomCheckboxField(isPrimaryFilterConfig, chkIsPrimaryMlestone_OnChange, chkIsPrimaryMlestone_OnActivate);
        var btnClearFilters = this._createClearFiltersButton(clearFilterButtonConfig, cboState, cboArtifact, cboMilestones, cboPrimaryMilestones, chkIsPrimaryMlestone);

        cboMilestones.store.on('beforeload', function(store, operation, eOpts){
            Ext.apply(operation, {
                params: {
                    order: 'Name Asc,ObjectID'
                }
           });
           return;
        });
        this.addQuickFilterButton = Ext.widget(
            {
                xtype: 'container',
                layout: 'column',
                items : [
                    {
                        xtype: 'container',
                        width: 560,
                        items : [
                            {
                                xtype: 'container',
                                columnWidth: 0.8,
                                layout:'vbox',
                                height: '175px',
                                flex: 1,
                                items: [
                                    {
                                        xtype: 'container',
                                        flex: 1,
                                        layout: 'hbox',
                                        items: [
                                            cboArtifact,
                                        ]
                                    },
                                    {
                                        xtype: 'container',
                                        flex: 1,
                                        layout: 'hbox',
                                        items: [
                                            cboState,
                                            chkIsPrimaryMlestone,
                                        ]
                                    },
                                    {
                                        xtype: 'container',
                                        layout: 'hbox',
                                        flex: 1,
                                        items:[
                                            cboMilestones, cboPrimaryMilestones
                                        ]
                                    },
                                    {
                                        xtype: 'container',
                                        layout: 'hbox',
                                        flex: 1,
                                        items: [
                                            {
                                                xtype: 'container',
                                                width: 150,
                                            },
                                            btnClearFilters
                                        ]
                                    }
                                    // {
                                    //     xtype: 'container',
                                    //     layout: 'hbox',
                                    //     height: '50',
                                    //     items:[
                                    //         cboPrimaryMilestones,
                                    //         // chkIsIncludeSubMilestone
                                    //     ]
                                    // }
                                ]
                            }
                        ]
                    },
                    {
                        xtype: 'container',
                        padding: '20 50',
                        width: 790,
                        html : '<strong>Milestone Team Insight:</strong> Select a milestone, portfolio item type and state(s). The app identifies teams that have work in those states on that milestone then shows all work of the selected type and state(s) for those teams.  <br/><br/>&nbsp; -&nbsp;Choose a Portfolio Item Type to populate state value(s). <br/>&nbsp; -&nbsp;Choosing a state filters grid items and refines milestone work scope. <br/>&nbsp; -&nbsp;Milestone must be selected for app to execute successfully.' 
                    }
                ]
            }
            
        
        );
        this.fields = [];
        this.fields.push(cboArtifact);
        this.fields.push(cboState);
        // this.fields.push(chkIsPrimaryMlestone);
        this.fields.push(cboMilestones);
        this.fields.push(cboPrimaryMilestones);
        // this.fields.push(chkIsIncludeSubMilestone);
        
    },

    _onToggleAdvanced: function() {
        this.fireEvent('toggleadvanced', this.toggleAdvancedButton);
    },

    _onAddQuickFilterClick: function() {
        var addQuickFilterConfig = Ext.clone(this.addQuickFilterConfig);
        var blackList =  _.map(this.fields, 'name');

        if (addQuickFilterConfig && addQuickFilterConfig.whiteListFields) {
            addQuickFilterConfig.whiteListFields = _.reject(this.addQuickFilterConfig.whiteListFields, function(field){
                return _.contains(blackList, field);
            });
        }
        this.addQuickFilterPopover = Ext.create('Rally.ui.popover.FieldPopover', {
            target: this.addQuickFilterButton.getEl(),
            placement: ['bottom', 'top', 'left', 'right'],
            fieldComboBoxConfig: _.merge({
                model: this.model,
                context: this.context,
                emptyText: 'Search filters...',
                additionalFields: [
                    {
                        name: 'ArtifactSearch',
                        displayName: 'Search'
                    },
                    {
                        name: 'ModelType',
                        displayName: 'Type'
                    }
                ],
                blackListFields: blackList,
                listeners: {
                    select: function(field, value) {
                        var fieldSelected = value[0].raw;
                        this.recordAction({
                            description: 'quick filter added',
                            miscData: {
                                field: fieldSelected.name || fieldSelected
                            }
                        });
                        this.addQuickFilterPopover.close();
                        this._onAddQuickFilterSelect(fieldSelected);
                    },
                    destroy: function(){
                        delete this.addQuickFilterPopover;
                    },
                    scope: this
                }
            }, addQuickFilterConfig, function(a, b) {
                if (_.isArray(a)) {
                    return a.concat(b);
                }
            })
        });
    },

    _onAddQuickFilterSelect: function(field) {
        var index = this.fields.length;
        var newItem = this._createField(index + 1, field);
        this.fields.push(newItem);
        this.insert(index, newItem);
        this.fireEvent('quickfilterchange', field, this);
    }

});